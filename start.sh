#!/usr/bin/env bash
# Start DLAS locally: the NID registry, the backend with its database, the DLAO
# dashboard showing the backend's cases, and the panel lawyers', court and jail
# dashboards on the same backend, with an ngrok tunnel that puts the backend (so
# Twilio can reach the phone lines) and every dashboard on one public URL.
# Ctrl-C stops everything.
#
# Dependencies are installed on the first run (and again when the requirements
# change). Each service's output is shown here and kept in .logs/.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOG_DIR=$ROOT/.logs

NID_PORT=8100
SERVER_PORT=8000
DASHBOARD_PORT=5173
LAWYER_PORT=5174
COURT_PORT=5175
PRISON_PORT=5176

# The dashboards' folders. Through the tunnel each is served at /<folder>/ from
# its public copy (a production build) on the port beside it.
APPS=(dlao-dashboard lawyer-dashboard court-dashboard prison-dashboard)
declare -A PUBLIC_PORT=([dlao-dashboard]=4173 [lawyer-dashboard]=4174
	[court-dashboard]=4175 [prison-dashboard]=4176)

INSTALL=0
NGROK=1
DASHBOARD=1
RESET_DB=0
SEED=1

usage() {
	cat <<EOF
Usage: ./start.sh [options]

Starts the NID registry (port $NID_PORT), the backend with its SQLite database
(port $SERVER_PORT), the DLAO dashboard (port $DASHBOARD_PORT), the panel lawyers'
dashboard (port $LAWYER_PORT), the court dashboard (port $COURT_PORT) and the jail
dashboard (port $PRISON_PORT), and an ngrok tunnel that makes them reachable from
anywhere: the backend at the tunnel's URL, and each dashboard at /<its folder>/
on the same URL (e.g. /dlao-dashboard/), as a production build that calls the
backend there and is rebuilt whenever its code changes (ports 4173-4176).
The database gets the demo court and jail records (server/scripts/seed_records.py).
The tunnel uses PUBLIC_BASE_URL in server/.env as its domain when one is set.
Ctrl-C stops everything. Logs are kept in .logs/.

Options:
  --no-ngrok     No tunnel: only this computer can use the dashboards, and
                 everything but real phone calls works
  --no-dashboard Backend only (no dashboards)
  --reset-db     Start with an empty database (the old one is kept as a backup)
  --no-seed      Leave out the demo court and jail records
  --install      Reinstall every dependency first
  -h, --help     Show this help
EOF
}

while (($#)); do
	case $1 in
	--install) INSTALL=1 ;;
	--no-ngrok) NGROK=0 ;;
	--no-dashboard) DASHBOARD=0 ;;
	--reset-db) RESET_DB=1 ;;
	--no-seed) SEED=0 ;;
	-h | --help) usage && exit 0 ;;
	*)
		printf 'Unknown option: %s\n\n' "$1" >&2
		usage >&2
		exit 2
		;;
	esac
	shift
done

if [[ -t 1 ]]; then
	BOLD=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
	BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi
declare -A COLOR=([nid]=$'\e[36m' [ngrok]=$'\e[35m' [server]=$'\e[32m' [dashboard]=$'\e[34m' [lawyer]=$'\e[33m'
	[court]=$'\e[94m' [prison]=$'\e[91m' [public-dlao]=$'\e[34m' [public-lawyer]=$'\e[33m'
	[public-court]=$'\e[94m' [public-prison]=$'\e[91m')
[[ -t 1 ]] || COLOR=()

say() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
warn() { printf '%s!!  %s%s\n' "$YELLOW" "$*" "$RESET" >&2; }
die() {
	printf '%sxx  %s%s\n' "$RED" "$*" "$RESET" >&2
	exit 1
}

# The value of KEY in an env file (the last one wins), without quotes.
env_value() {
	local file=$1 key=$2
	[[ -f $file ]] || return 0
	sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 |
		sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# --- Prerequisites and dependencies -------------------------------------------

need() { command -v "$1" >/dev/null || die "$1 is not installed. $2"; }
need curl ""
need setsid "It comes with util-linux."
((!NGROK)) || need ngrok "Install it from https://ngrok.com/download, or pass --no-ngrok."
((!DASHBOARD)) || need npm "Install Node.js 20 or later, or pass --no-dashboard."
if ! command -v uv >/dev/null; then
	need python3.12 "Install uv (https://docs.astral.sh/uv/) or Python 3.12."
fi

# A service's virtualenv, with its requirements installed when they changed.
python_env() {
	local dir=$ROOT/$1 venv=$ROOT/$1/.venv
	local stamp=$venv/.start-sh-installed
	if [[ ! -x $venv/bin/python ]]; then
		say "Creating $1/.venv"
		if command -v uv >/dev/null; then
			uv venv -q --python 3.12 "$venv"
		else
			python3.12 -m venv "$venv"
		fi
	fi
	if ((INSTALL)) || [[ ! -f $stamp || $dir/requirements.txt -nt $stamp || $dir/requirements-dev.txt -nt $stamp ]]; then
		say "Installing $1 dependencies"
		if command -v uv >/dev/null; then
			uv pip install -q -r "$dir/requirements-dev.txt" --python "$venv/bin/python"
		else
			"$venv/bin/pip" install -q -r "$dir/requirements-dev.txt"
		fi
		touch "$stamp"
	fi
}

python_env nid-server
python_env server

if [[ ! -f $ROOT/server/.env ]]; then
	cp "$ROOT/server/.env.example" "$ROOT/server/.env"
	say "Created server/.env from .env.example (every key is optional in development)"
fi

# A setting as the backend sees it: the environment first, then server/.env.
server_setting() {
	local value=${!1-}
	[[ -n $value ]] || value=$(env_value "$ROOT/server/.env" "$1")
	printf '%s' "$value"
}

# A setting as Vite sees it: the environment, then .env.local, then .env.
dashboard_setting() {
	local value=${!1-} file
	for file in .env.local .env; do
		[[ -n $value ]] || value=$(env_value "$ROOT/dlao-dashboard/$file" "$1")
	done
	printf '%s' "$value"
}

if ((DASHBOARD)); then
	for app in "${APPS[@]}"; do
		lock=$ROOT/$app/node_modules/.package-lock.json
		if ((INSTALL)) || [[ ! -f $lock || $ROOT/$app/package-lock.json -nt $lock ]]; then
			say "Installing $app dependencies"
			(cd "$ROOT/$app" && npm install --no-audit --no-fund --loglevel=error >/dev/null)
		fi
	done
fi

# --- Services ------------------------------------------------------------------

port_owner() {
	if command -v ss >/dev/null; then
		ss -Hltnp "sport = :$1" 2>/dev/null | head -n 1
	elif (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then
		echo "something"
	fi
}

ports=("$NID_PORT" "$SERVER_PORT")
((!DASHBOARD)) || ports+=("$DASHBOARD_PORT" "$LAWYER_PORT" "$COURT_PORT" "$PRISON_PORT")
((!DASHBOARD || !NGROK)) || ports+=("${PUBLIC_PORT[@]}")
for port in "${ports[@]}"; do
	owner=$(port_owner "$port")
	[[ -z $owner ]] || die "Port $port is already in use: $owner"
done

# --- Database ------------------------------------------------------------------

# SQLite needs no server: the backend creates the file and its tables at startup.
db_url=$(server_setting DATABASE_URL)
db_url=${db_url:-sqlite:///./dlas.db}
db_file=''
if [[ $db_url == sqlite:///* ]]; then
	db_file=${db_url#sqlite:///}
	[[ $db_file == /* ]] || db_file=$ROOT/server/${db_file#./}
fi

if ((RESET_DB)); then
	[[ -n $db_file ]] || die "--reset-db needs a SQLite DATABASE_URL (it is $db_url)."
	if [[ -f $db_file ]]; then
		backup=${db_file%.db}-$(date +%Y%m%d-%H%M%S).db
		for suffix in '' -journal -wal -shm; do
			[[ ! -f $db_file$suffix ]] || mv "$db_file$suffix" "$backup$suffix"
		done
		say "Moved the old database to ${backup#"$ROOT"/}"
	fi
fi

mkdir -p "$LOG_DIR"

declare -A PID=()
ORDER=()
FOLLOW_PID=''

# Start a service in its own session, so stopping it stops its children too.
start() {
	local name=$1 dir=$2
	shift 2
	: >"$LOG_DIR/$name.log"
	(cd "$dir" && exec setsid "$@") >>"$LOG_DIR/$name.log" 2>&1 </dev/null &
	PID[$name]=$!
	disown "$!" # we report how it ended, not bash
	ORDER+=("$name")
}

alive() { kill -0 "${PID[$1]}" 2>/dev/null; }

any_alive() {
	local pid
	for pid in "${PID[@]}"; do
		kill -0 -- "-$pid" 2>/dev/null && return 0
	done
	return 1
}

stop_all() {
	trap - EXIT INT TERM HUP
	if [[ -n $FOLLOW_PID ]]; then
		pkill -TERM -P "$FOLLOW_PID" 2>/dev/null || true
		kill -TERM "$FOLLOW_PID" 2>/dev/null || true
	fi
	((${#PID[@]})) || return 0
	printf '\n'
	say "Stopping ${ORDER[*]}"
	local pid i
	for pid in "${PID[@]}"; do
		kill -TERM -- "-$pid" 2>/dev/null || true
	done
	for ((i = 0; i < 40; i++)); do
		any_alive || return 0
		sleep 0.25
	done
	for pid in "${PID[@]}"; do
		kill -KILL -- "-$pid" 2>/dev/null || true
	done
}
trap stop_all EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

fail() {
	printf '%sxx  %s%s\n' "$RED" "$2" "$RESET" >&2
	printf '%s--- last lines of .logs/%s.log ---%s\n' "$DIM" "$1" "$RESET" >&2
	tail -n 25 "$LOG_DIR/$1.log" >&2 || true
	exit 1
}

# Wait until URL answers, or fail if the service stops or takes too long.
wait_for() {
	local name=$1 url=$2 seconds=$3 i
	for ((i = 0; i < seconds * 4; i++)); do
		curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null && return 0
		alive "$name" || fail "$name" "$name stopped while starting."
		sleep 0.25
	done
	fail "$name" "$name did not answer at $url within ${seconds}s."
}

say "Starting the NID registry"
start nid "$ROOT/nid-server" env -u PYTHONPATH \
	.venv/bin/uvicorn app.main:app --port "$NID_PORT"
wait_for nid "http://localhost:$NID_PORT/health" 30

# The tunnel comes up before the backend, which needs its public URL for the
# calls' media streams (and Twilio's signatures). The dashboards' public copies
# share that URL, each at /<folder>/: ngrok's free plan has a single domain, so
# ngrok sends those paths on (through internal endpoints) and the rest to the backend.
write_ngrok_config() {
	local app
	printf 'version: 3\nendpoints:\n  - name: dlas-backend\n'
	# A reserved domain keeps Twilio's webhooks valid between runs.
	if [[ $configured_url =~ ^https://[^/]+ && ! $configured_url =~ ^https://(example\.|localhost) ]]; then
		printf '    url: %s\n' "${configured_url%/}"
	fi
	printf '    upstream:\n      url: %s\n' "$SERVER_PORT"
	((DASHBOARD)) || return 0
	printf '    traffic_policy:\n      on_http_request:\n'
	for app in "${APPS[@]}"; do
		printf '        - expressions: ["req.url.path == %s"]\n' "'/$app'"
		printf '          actions: [{type: redirect, config: {to: "/%s/"}}]\n' "$app"
		printf '        - expressions: ["req.url.path.startsWith(%s)"]\n' "'/$app/'"
		printf '          actions: [{type: forward-internal, config: {url: "https://%s.internal"}}]\n' "$app"
	done
	for app in "${APPS[@]}"; do
		printf '  - name: dlas-%s\n    url: https://%s.internal\n' "$app" "$app"
		printf '    upstream:\n      url: %s\n' "${PUBLIC_PORT[$app]}"
	done
}

configured_url=$(server_setting PUBLIC_BASE_URL)
public_url='' public_host='' inspector=''
if ((NGROK)); then
	write_ngrok_config >"$LOG_DIR/ngrok.yml"
	endpoints=(dlas-backend)
	((!DASHBOARD)) || endpoints+=("${APPS[@]/#/dlas-}")
	# The account's own configuration holds its authtoken (or NGROK_AUTHTOKEN does).
	ngrok_configs=$LOG_DIR/ngrok.yml
	default_config=$(ngrok config check 2>/dev/null | sed -n 's/^Valid configuration file at //p')
	[[ -z $default_config ]] || ngrok_configs=$default_config,$ngrok_configs
	say "Opening the ngrok tunnel"
	start ngrok "$ROOT" ngrok start --config "$ngrok_configs" --log stdout --log-format logfmt \
		"${endpoints[@]}"
	for ((i = 0; i < 120; i++)); do
		started=$(grep -c 'msg="started tunnel"' "$LOG_DIR/ngrok.log" || true)
		((started < ${#endpoints[@]})) || break
		alive ngrok || fail ngrok "ngrok could not open the tunnel. Pass --no-ngrok to run without it."
		sleep 0.25
	done
	((started >= ${#endpoints[@]})) || fail ngrok "ngrok did not open the tunnel within 30s."
	public_url=$(sed -n 's/.*msg="started tunnel".* name=dlas-backend .* url=\([^ ]*\).*/\1/p' "$LOG_DIR/ngrok.log" | tail -n 1)
	public_host=${public_url#*://}
	public_host=${public_host%%/*}
	inspector=$(sed -n 's/.*msg="starting web service".* addr=\([^ ]*\).*/\1/p' "$LOG_DIR/ngrok.log" | tail -n 1)
fi

# Demo court cases, cause lists and prisoners. Idempotent: records already there
# are left alone. Nothing is sent and no model is asked, whatever server/.env says.
if ((SEED)); then
	say "Adding the demo court and jail records"
	(cd "$ROOT/server" && env -u PYTHONPATH SMS_DRY_RUN=true ADNSMS_API_KEY= ADNSMS_API_SECRET= \
		ANTHROPIC_API_KEY= OPENAI_API_KEY= NID_SERVER_URL= \
		.venv/bin/python -m scripts.seed_records) >"$LOG_DIR/seed.log" 2>&1 ||
		warn "The demo records could not be added (see .logs/seed.log)."
fi

say "Starting the backend"
server_env=(NID_SERVER_URL="http://localhost:$NID_PORT")
# Every dashboard must reach the backend, whatever CORS_ORIGINS in server/.env says.
cors=$(server_setting CORS_ORIGINS)
for origin in "http://localhost:$DASHBOARD_PORT" "http://localhost:$LAWYER_PORT" \
	"http://localhost:$COURT_PORT" "http://localhost:$PRISON_PORT"; do
	[[ ,$cors, == *",$origin,"* ]] || cors=${cors:+$cors,}$origin
done
server_env+=(CORS_ORIGINS="$cors")
[[ -z $public_url ]] || server_env+=(PUBLIC_BASE_URL="$public_url")
start server "$ROOT/server" env -u PYTHONPATH "${server_env[@]}" \
	.venv/bin/uvicorn app.main:app --port "$SERVER_PORT" --reload --reload-dir app
wait_for server "http://localhost:$SERVER_PORT/health" 90

# A dashboard's public copy, served through the tunnel at /<folder>/: a production
# build, rebuilt whenever the code changes. (A dev server's page is hundreds of
# requests, which trip the ngrok free plan's rate limit.) It calls the backend at
# the tunnel's URL, so it works wherever it is opened.
PUBLIC_COPY='
vite=node_modules/.bin/vite
"$vite" build --watch --logLevel error --base "$1" --outDir "$2" &
until [[ -f $2/index.html ]]; do sleep 0.25; done
"$vite" preview --base "$1" --outDir "$2" --port "$3" --strictPort &
wait -n'
start_public_copy() {
	local name=$1 app=$2 out=$ROOT/$2/node_modules/.tunnel-build
	rm -rf "$out"
	start "$name" "$ROOT/$app" env "${dashboard_env[@]}" \
		VITE_API_URL="$public_url" TUNNEL_HOST="$public_host" \
		bash -c "$PUBLIC_COPY" _ "/$app/" "$out" "${PUBLIC_PORT[$app]}"
}

if ((DASHBOARD)); then
	api_url=$(dashboard_setting VITE_API_URL)
	api_url=${api_url:-http://localhost:$SERVER_PORT}
	dashboard_env=(VITE_API_URL="$api_url")
	# The backend's API_TOKEN, unless the dashboard has its own.
	token=$(dashboard_setting VITE_API_TOKEN)
	[[ -n $token ]] || token=$(server_setting API_TOKEN)
	[[ -z $token ]] || dashboard_env+=(VITE_API_TOKEN="$token")

	say "Starting the dashboards"
	start dashboard "$ROOT/dlao-dashboard" env "${dashboard_env[@]}" \
		npm run dev -- --port "$DASHBOARD_PORT" --strictPort
	# Panel lawyers post their court updates from here, to the same backend.
	start lawyer "$ROOT/lawyer-dashboard" env "${dashboard_env[@]}" \
		npm run dev -- --port "$LAWYER_PORT" --strictPort
	# Courts and jails submit applications and keep their records here.
	start court "$ROOT/court-dashboard" env "${dashboard_env[@]}" \
		npm run dev -- --port "$COURT_PORT" --strictPort
	start prison "$ROOT/prison-dashboard" env "${dashboard_env[@]}" \
		npm run dev -- --port "$PRISON_PORT" --strictPort
	if [[ -n $public_url ]]; then
		for app in "${APPS[@]}"; do start_public_copy "public-${app%-dashboard}" "$app"; done
	fi
	wait_for dashboard "http://localhost:$DASHBOARD_PORT" 60
	wait_for lawyer "http://localhost:$LAWYER_PORT" 60
	wait_for court "http://localhost:$COURT_PORT" 60
	wait_for prison "http://localhost:$PRISON_PORT" 60
	if [[ -n $public_url ]]; then
		for app in "${APPS[@]}"; do
			wait_for "public-${app%-dashboard}" "http://localhost:${PUBLIC_PORT[$app]}/$app/" 60
		done
	fi
fi

# --- Summary -------------------------------------------------------------------

health=$(curl -fsS "http://localhost:$SERVER_PORT/health")
read -r llm provider stt dry_run < <(env -u PYTHONPATH "$ROOT/server/.venv/bin/python" -c '
import json, sys
h = json.load(sys.stdin)
print(h["llm"], h["llm_provider"], h["speech_to_text"], h["sms_dry_run"])
' <<<"$health")
# "ok", "off", "error: <what to fix>" or "unchecked: <why>" (checked at startup).
voice=$(env -u PYTHONPATH "$ROOT/server/.venv/bin/python" -c '
import json, sys
print(json.load(sys.stdin).get("voice", "off"))
' <<<"$health")

on() { [[ $1 == True ]] && printf '%son%s' "$GREEN" "$RESET" || printf 'off'; }

row() { printf '  %-14s %s\n' "$1" "$2"; }

# A dashboard's address here and, through the tunnel, from anywhere.
dashboard_row() {
	local label=$1 port=$2 app=$3 note=$4
	row "$label" "$BOLD$GREEN""http://localhost:$port$RESET${note:+  ($note)}"
	[[ -z $public_url ]] || row "" "$BOLD$GREEN${public_url%/}/$app/$RESET  (from anywhere)"
}

printf '\n%sDLAS is running%s\n' "$BOLD" "$RESET"
if ((DASHBOARD)); then
	cases_from=''
	[[ $api_url == "http://localhost:$SERVER_PORT" ]] || cases_from="cases from $api_url"
	dashboard_row "Dashboard" "$DASHBOARD_PORT" dlao-dashboard "$cases_from"
	dashboard_row "Lawyers" "$LAWYER_PORT" lawyer-dashboard "panel lawyers' dashboard"
	dashboard_row "Courts" "$COURT_PORT" court-dashboard "court staff: CS-11, CS-14"
	dashboard_row "Jails" "$PRISON_PORT" prison-dashboard "jail staff: JS-08, JS-03"
fi
row "Backend API" "http://localhost:$SERVER_PORT/docs"
row "NID registry" "http://localhost:$NID_PORT/docs"
if [[ -n $db_file ]]; then
	row "Database" "SQLite, ${db_file#"$ROOT"/}"
else
	row "Database" "${db_url%%:*} (DATABASE_URL)"
fi
if [[ -n $public_url ]]; then
	row "Public URL" "$public_url${inspector:+  (requests: http://$inspector)}"
	row "Twilio" "hotline   POST $public_url/telephony/voice"
	row "" "helpline  POST $public_url/telephony/voice?line=helpline"
	row "" "status    POST $public_url/telephony/status"
	if [[ ${public_url%/} != "${configured_url%/}" ]]; then
		warn "This is a new ngrok URL. Point the Twilio numbers at it, or reserve a domain and set PUBLIC_BASE_URL in server/.env."
	fi
	if ((DASHBOARD)) && [[ -n $token ]]; then
		warn "Anyone who opens a dashboard through the tunnel can read the API_TOKEN it carries."
	fi
else
	row "Phone lines" "off (no tunnel)"
fi
if [[ $llm == True ]]; then
	row "AI agents" "$(on True) ($provider)"
else
	row "AI agents" "rule-based (no $provider key)"
fi
row "Speech-to-text" "$(on "$stt")"
case $voice in
ok) row "Voice" "$(on True) (ElevenLabs)" ;;
off) row "Voice" "off: callers only hear that the line cannot take calls" ;;
unchecked*) row "Voice" "${YELLOW}not checked: ${voice#unchecked: }${RESET}" ;;
*) row "Voice" "${RED}${BOLD}NOT WORKING: ${voice#error: }${RESET}" ;;
esac
if [[ $dry_run == True ]]; then
	row "SMS" "dry run (nothing is sent)"
else
	row "SMS" "${YELLOW}${BOLD}LIVE: real SMS will be sent${RESET}"
fi
printf '\n%sLogs follow (also in .logs/). Ctrl-C stops everything.%s\n\n' "$DIM" "$RESET"

# --- Logs ----------------------------------------------------------------------

# Every service's new log lines, each prefixed with the service's name.
follow_logs() {
	local files=() name line held=0 i
	for name in "${ORDER[@]}"; do files+=("$LOG_DIR/$name.log"); done
	name=''
	tail -n 0 -F "${files[@]}" 2>/dev/null | while IFS= read -r line; do
		# tail announces each switch of file with a blank line and a header.
		if [[ $line =~ ^==\>\ .*/([a-z-]+)\.log\ \<==$ ]]; then
			name=${BASH_REMATCH[1]} held=0
			continue
		fi
		if [[ -z $line ]]; then
			held=$((held + 1))
			continue
		fi
		for ((i = 0; i < held; i++)); do
			printf '%s%-13s%s│\n' "${COLOR[$name]-}" "$name" "$RESET"
		done
		held=0
		printf '%s%-13s%s│ %s\n' "${COLOR[$name]-}" "$name" "$RESET" "$line"
	done
}
follow_logs 2>/dev/null &
FOLLOW_PID=$!
disown "$FOLLOW_PID"

while sleep 1; do
	for name in "${ORDER[@]}"; do
		alive "$name" || fail "$name" "$name stopped."
	done
done

#!/usr/bin/env bash
# Start DLAS locally: the NID registry, the backend with its database, an ngrok
# tunnel so Twilio can reach the phone lines, and the DLAO dashboard showing the
# backend's cases. Ctrl-C stops everything.
#
# Dependencies are installed on the first run (and again when the requirements
# change). Each service's output is shown here and kept in .logs/.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOG_DIR=$ROOT/.logs

NID_PORT=8100
SERVER_PORT=8000
DASHBOARD_PORT=5173

INSTALL=0
NGROK=1
DASHBOARD=1

usage() {
	cat <<EOF
Usage: ./start.sh [options]

Starts the NID registry (port $NID_PORT), the backend (port $SERVER_PORT), an ngrok
tunnel to the backend (on the domain in PUBLIC_BASE_URL in server/.env, when one
is set) and the dashboard (port $DASHBOARD_PORT). Ctrl-C stops everything. Logs are
kept in .logs/.

Options:
  --no-ngrok     No tunnel: everything but real phone calls works
  --no-dashboard Backend only
  --install      Reinstall every dependency first
  -h, --help     Show this help
EOF
}

while (($#)); do
	case $1 in
	--install) INSTALL=1 ;;
	--no-ngrok) NGROK=0 ;;
	--no-dashboard) DASHBOARD=0 ;;
	-h | --help) usage && exit 0 ;;
	*) usage >&2 && exit 2 ;;
	esac
	shift
done

if [[ -t 1 ]]; then
	BOLD=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
	BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi
declare -A COLOR=([nid]=$'\e[36m' [ngrok]=$'\e[35m' [server]=$'\e[32m' [dashboard]=$'\e[34m')
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
	sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 |
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
	lock=$ROOT/dlao-dashboard/node_modules/.package-lock.json
	if ((INSTALL)) || [[ ! -f $lock || $ROOT/dlao-dashboard/package-lock.json -nt $lock ]]; then
		say "Installing dlao-dashboard dependencies"
		(cd "$ROOT/dlao-dashboard" && npm install --no-audit --no-fund --loglevel=error >/dev/null)
	fi
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
((!DASHBOARD)) || ports+=("$DASHBOARD_PORT")
for port in "${ports[@]}"; do
	owner=$(port_owner "$port")
	[[ -z $owner ]] || die "Port $port is already in use: $owner"
done

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
# calls' media streams (and Twilio's signatures).
configured_url=$(server_setting PUBLIC_BASE_URL)
public_url='' inspector=''
if ((NGROK)); then
	ngrok_args=(http "$SERVER_PORT" --log stdout --log-format logfmt)
	# A reserved domain keeps Twilio's webhooks valid between runs.
	if [[ $configured_url =~ ^https://[^/]+ && ! $configured_url =~ ^https://(example\.|localhost) ]]; then
		ngrok_args+=(--url "${configured_url%/}")
	fi
	say "Opening the ngrok tunnel"
	start ngrok "$ROOT" ngrok "${ngrok_args[@]}"
	for ((i = 0; i < 120; i++)); do
		public_url=$(sed -n 's/.*msg="started tunnel".* url=\([^ ]*\).*/\1/p' "$LOG_DIR/ngrok.log" | tail -n 1)
		[[ -z $public_url ]] || break
		alive ngrok || fail ngrok "ngrok could not open the tunnel (or pass --no-ngrok)."
		sleep 0.25
	done
	[[ -n $public_url ]] || fail ngrok "ngrok did not open the tunnel within 30s."
	inspector=$(sed -n 's/.*msg="starting web service".* addr=\([^ ]*\).*/\1/p' "$LOG_DIR/ngrok.log" | tail -n 1)
fi

say "Starting the backend"
server_env=(NID_SERVER_URL="http://localhost:$NID_PORT")
[[ -z $public_url ]] || server_env+=(PUBLIC_BASE_URL="$public_url")
start server "$ROOT/server" env -u PYTHONPATH "${server_env[@]}" \
	.venv/bin/uvicorn app.main:app --port "$SERVER_PORT" --reload --reload-dir app
wait_for server "http://localhost:$SERVER_PORT/health" 90

if ((DASHBOARD)); then
	api_url=$(dashboard_setting VITE_API_URL)
	api_url=${api_url:-http://localhost:$SERVER_PORT}
	dashboard_env=(VITE_API_URL="$api_url")
	# The backend's API_TOKEN, unless the dashboard has its own.
	token=$(dashboard_setting VITE_API_TOKEN)
	[[ -n $token ]] || token=$(server_setting API_TOKEN)
	[[ -z $token ]] || dashboard_env+=(VITE_API_TOKEN="$token")
	if [[ $api_url == "http://localhost:$SERVER_PORT" && $(server_setting CORS_ORIGINS) != *"localhost:$DASHBOARD_PORT"* ]]; then
		warn "CORS_ORIGINS in server/.env does not include http://localhost:$DASHBOARD_PORT, so the dashboard cannot reach the backend."
	fi

	say "Starting the dashboard"
	start dashboard "$ROOT/dlao-dashboard" env "${dashboard_env[@]}" \
		npm run dev -- --port "$DASHBOARD_PORT" --strictPort
	wait_for dashboard "http://localhost:$DASHBOARD_PORT" 60
fi

# --- Summary -------------------------------------------------------------------

health=$(curl -fsS "http://localhost:$SERVER_PORT/health")
read -r llm provider stt dry_run < <(env -u PYTHONPATH "$ROOT/server/.venv/bin/python" -c '
import json, sys
h = json.load(sys.stdin)
print(h["llm"], h["llm_provider"], h["speech_to_text"], h["sms_dry_run"])
' <<<"$health")

on() { [[ $1 == True ]] && printf '%son%s' "$GREEN" "$RESET" || printf 'off'; }

row() { printf '  %-14s %s\n' "$1" "$2"; }
printf '\n%sDLAS is running%s\n' "$BOLD" "$RESET"
if ((DASHBOARD)); then
	dashboard_row="$BOLD$GREEN""http://localhost:$DASHBOARD_PORT$RESET"
	[[ $api_url == "http://localhost:$SERVER_PORT" ]] || dashboard_row+="  (cases from $api_url)"
	row "Dashboard" "$dashboard_row"
fi
row "Backend API" "http://localhost:$SERVER_PORT/docs"
row "NID registry" "http://localhost:$NID_PORT/docs"
if [[ -n $public_url ]]; then
	row "Public URL" "$public_url${inspector:+  (requests: http://$inspector)}"
	row "Twilio" "hotline   POST $public_url/telephony/voice"
	row "" "helpline  POST $public_url/telephony/voice?line=helpline"
	row "" "status    POST $public_url/telephony/status"
	if [[ ${public_url%/} != "${configured_url%/}" ]]; then
		warn "This is a new ngrok URL. Point the Twilio numbers at it, or reserve a domain and set PUBLIC_BASE_URL in server/.env."
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
		if [[ $line =~ ^==\>\ .*/([a-z]+)\.log\ \<==$ ]]; then
			name=${BASH_REMATCH[1]} held=0
			continue
		fi
		if [[ -z $line ]]; then
			held=$((held + 1))
			continue
		fi
		for ((i = 0; i < held; i++)); do
			printf '%s%-9s%s│\n' "${COLOR[$name]-}" "$name" "$RESET"
		done
		held=0
		printf '%s%-9s%s│ %s\n' "${COLOR[$name]-}" "$name" "$RESET" "$line"
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

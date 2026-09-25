#!/usr/bin/env bash
# Start DLAS locally: the NID registry and the backend with its database.
# Ctrl-C stops everything.
#
# Dependencies are installed on the first run (and again when the requirements
# change). Each service's output is shown here and kept in .logs/.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOG_DIR=$ROOT/.logs

NID_PORT=8100
SERVER_PORT=8000

INSTALL=0

usage() {
	cat <<EOF
Usage: ./start.sh [options]

Starts the NID registry (port $NID_PORT) and the backend (port $SERVER_PORT).
Ctrl-C stops everything. Logs are kept in .logs/.

Options:
  --install      Reinstall every dependency first
  -h, --help     Show this help
EOF
}

while (($#)); do
	case $1 in
	--install) INSTALL=1 ;;
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
declare -A COLOR=([nid]=$'\e[36m' [server]=$'\e[32m')
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

# --- Services ------------------------------------------------------------------

port_owner() {
	if command -v ss >/dev/null; then
		ss -Hltnp "sport = :$1" 2>/dev/null | head -n 1
	elif (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then
		echo "something"
	fi
}

for port in "$NID_PORT" "$SERVER_PORT"; do
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

say "Starting the backend"
start server "$ROOT/server" env -u PYTHONPATH \
	NID_SERVER_URL="http://localhost:$NID_PORT" \
	.venv/bin/uvicorn app.main:app --port "$SERVER_PORT" --reload --reload-dir app
wait_for server "http://localhost:$SERVER_PORT/health" 90

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
row "Backend API" "http://localhost:$SERVER_PORT/docs"
row "NID registry" "http://localhost:$NID_PORT/docs"
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
follow_logs &
FOLLOW_PID=$!

while sleep 1; do
	for name in "${ORDER[@]}"; do
		alive "$name" || fail "$name" "$name stopped."
	done
done

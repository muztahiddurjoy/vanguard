#!/usr/bin/env bash
# Deploy DLAS on this server (the VPS): the backend and the NID registry under pm2
# on localhost ports, the four dashboards and the legal aid app as static builds,
# and nginx serving each on its own subdomain, over HTTPS once the subdomain's DNS
# points here. Run it as root from the repo, after a git pull. Running it again
# redeploys (and gets the certificates still missing); the database is kept.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY=$ROOT/deploy

DOMAIN=${DOMAIN:-appbaksho.com}
API_HOST=${API_HOST:-dlas-api.$DOMAIN}
API_PORT=${API_PORT:-3130}
NID_PORT=${NID_PORT:-3131}
DATA_DIR=${DATA_DIR:-/var/lib/vanguard}
WEB_ROOT=${WEB_ROOT:-/var/www/vanguard}
NGINX_SITE=/etc/nginx/sites-available/vanguard
# Where certbot leaves the challenge files that nginx serves for each host.
export ACME_ROOT=/var/www/html
# The address every host's DNS record must give before it gets a certificate.
PUBLIC_IP=${PUBLIC_IP:-$(hostname -I | awk '{print $1}')}

# The web apps, each on its own host. The legal aid app keeps its own data; the
# dashboards call the backend.
APPS=(dlao-dashboard lawyer-dashboard court-dashboard prison-dashboard vanguard-digital-leagal-aid)
declare -A HOST=(
	[dlao-dashboard]=dlao.$DOMAIN
	[lawyer-dashboard]=lawyer.$DOMAIN
	[court-dashboard]=court.$DOMAIN
	[prison-dashboard]=prison.$DOMAIN
	[vanguard-digital-leagal-aid]=legalaid.$DOMAIN
)
DASHBOARDS=(dlao-dashboard lawyer-dashboard court-dashboard prison-dashboard)

BUILD=1
SEED_DEMO=0

usage() {
	cat <<EOF
Usage: deploy/deploy.sh [options]

Builds and deploys everything on this server:
$(printf '  %-32s %s\n' "https://$API_HOST" "the backend (pm2 vanguard-api, 127.0.0.1:$API_PORT)" \
		"NID registry" "pm2 vanguard-nid, 127.0.0.1:$NID_PORT (not public)"
	for app in "${APPS[@]}"; do printf '  %-32s %s\n' "https://${HOST[$app]}" "$app"; done)
The database and uploads are kept in $DATA_DIR, the builds in $WEB_ROOT.
DOMAIN, API_HOST, API_PORT, NID_PORT, DATA_DIR and WEB_ROOT can be overridden
from the environment.

Options:
  --no-build     Keep the published web builds (update the services and nginx)
  --seed-demo    Add the demo court and jail records (idempotent; the dashboards'
                 demo staff accounts use them)
  -h, --help     Show this help
EOF
}

while (($#)); do
	case $1 in
	--no-build) BUILD=0 ;;
	--seed-demo) SEED_DEMO=1 ;;
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
	BOLD=$'\e[1m' RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
	BOLD='' RED='' GREEN='' YELLOW='' RESET=''
fi

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

# --- Prerequisites ---------------------------------------------------------------

((EUID == 0)) || die "Run this as root (it installs nginx sites and pm2 apps)."
# uv's installer puts it here, which a non-interactive shell may not have on PATH.
PATH=$HOME/.local/bin:$PATH
need() { command -v "$1" >/dev/null || die "$1 is not installed. $2"; }
need uv "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
need npm "Install Node.js 20 or later."
need pm2 "Install it with: npm install -g pm2"
need nginx ""
need curl ""
need openssl ""

# --- Settings ----------------------------------------------------------------------

SERVER_ENV=$ROOT/server/.env
NID_ENV=$ROOT/nid-server/.env

# Production settings, with new secrets, for a service that has none yet.
create_env_files() {
	local nid_key
	nid_key=$(env_value "$NID_ENV" NID_API_KEY)
	[[ -n $nid_key ]] || nid_key=$(env_value "$SERVER_ENV" NID_SERVER_API_KEY)
	[[ -n $nid_key ]] || nid_key=$(openssl rand -hex 32)
	if [[ ! -f $NID_ENV ]]; then
		cat >"$NID_ENV" <<EOF
# Production settings for the VPS (created by deploy/deploy.sh). Other keys: .env.example.
ENVIRONMENT=production
# The backend sends this as X-API-Key (its NID_SERVER_API_KEY).
NID_API_KEY=$nid_key
EOF
		say "Created nid-server/.env"
	fi
	if [[ ! -f $SERVER_ENV ]]; then
		cat >"$SERVER_ENV" <<EOF
# Production settings for the VPS (created by deploy/deploy.sh). Other keys:
# .env.example. deploy/deploy.sh sets PUBLIC_BASE_URL, CORS_ORIGINS, NID_SERVER_URL,
# DATABASE_URL and UPLOAD_DIR itself, which override any value here.
ENVIRONMENT=production
# INFO: DEBUG would log what callers say.
LOG_LEVEL=INFO
# The dashboards send it with every request (their builds carry it).
API_TOKEN=$(openssl rand -hex 32)
# Keep it: National ID numbers already stored are hashed with it.
NID_HASH_KEY=$(openssl rand -hex 32)
NID_SERVER_API_KEY=$nid_key
OFFICE_DISTRICT=Rangpur
TIMEZONE=Asia/Dhaka

# The agents' model and the phone lines' speech-to-text and voice. Without them
# the agents are rule-based and callers hear that the line cannot take calls.
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# Twilio's signatures are checked in production.
TWILIO_AUTH_TOKEN=

# The NID registry's numbers are fictional but may belong to real people: send real
# SMS only to SMS_ALLOWLIST, or once the records are real.
SMS_DRY_RUN=true
ADNSMS_API_KEY=
ADNSMS_API_SECRET=
EOF
		say "Created server/.env: add the model, voice and Twilio keys there (see .env.example)"
	fi
	chmod 600 "$SERVER_ENV" "$NID_ENV"
	[[ $(env_value "$SERVER_ENV" NID_SERVER_API_KEY) == "$(env_value "$NID_ENV" NID_API_KEY)" ]] ||
		die "NID_SERVER_API_KEY in server/.env is not nid-server/.env's NID_API_KEY."
}

create_env_files
API_TOKEN=$(env_value "$SERVER_ENV" API_TOKEN)
[[ -n $API_TOKEN ]] || warn "server/.env has no API_TOKEN: anyone can use the backend's API."

# --- Backend and NID registry ------------------------------------------------------

# A service's virtualenv, with its requirements installed when they changed.
python_env() {
	local dir=$ROOT/$1 venv=$ROOT/$1/.venv
	local stamp=$venv/.deploy-installed
	if [[ ! -x $venv/bin/python ]]; then
		say "Creating $1/.venv"
		uv venv -q --python 3.12 "$venv"
	fi
	if [[ ! -f $stamp || $dir/requirements.txt -nt $stamp ]]; then
		say "Installing $1 dependencies"
		uv pip install -q -r "$dir/requirements.txt" --python "$venv/bin/python"
		touch "$stamp"
	fi
}

python_env nid-server
python_env server
mkdir -p "$DATA_DIR/uploads"
chmod 700 "$DATA_DIR"

if ((SEED_DEMO)); then
	# Idempotent. Nothing is sent and no model is asked, whatever server/.env says.
	say "Adding the demo court and jail records"
	(cd "$ROOT/server" && env -u PYTHONPATH DATABASE_URL="sqlite:///$DATA_DIR/dlas.db" \
		UPLOAD_DIR="$DATA_DIR/uploads" SMS_DRY_RUN=true ADNSMS_API_KEY= ADNSMS_API_SECRET= \
		ANTHROPIC_API_KEY= OPENAI_API_KEY= NID_SERVER_URL= \
		.venv/bin/python -m scripts.seed_records --force)
fi

origins=()
for app in "${DASHBOARDS[@]}"; do origins+=("https://${HOST[$app]}"); done
say "Starting the backend and the NID registry"
(
	IFS=,
	export VANGUARD_API_PORT=$API_PORT VANGUARD_NID_PORT=$NID_PORT VANGUARD_DATA_DIR=$DATA_DIR \
		VANGUARD_PUBLIC_BASE_URL=https://$API_HOST VANGUARD_CORS_ORIGINS="${origins[*]}"
	env -u PYTHONPATH pm2 startOrReload "$DEPLOY/ecosystem.config.cjs" --update-env >/dev/null
)
pm2 save >/dev/null

# Wait until URL answers, or show the app's log and stop.
wait_for() {
	local app=$1 url=$2 i
	for ((i = 0; i < 120; i++)); do
		curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null && return 0
		sleep 0.5
	done
	pm2 logs "$app" --nostream --lines 30 >&2 || true
	die "$app did not answer at $url within 60s."
}
wait_for vanguard-nid "http://127.0.0.1:$NID_PORT/health"
wait_for vanguard-api "http://127.0.0.1:$API_PORT/health"

# --- Web apps ----------------------------------------------------------------------

# Build APP into its published folder, replacing the old build in one step.
build_app() {
	local app=$1 dir=$ROOT/$1 lock=$ROOT/$1/node_modules/.package-lock.json
	local next=$WEB_ROOT/.$1.next old=$WEB_ROOT/.$1.old vars=()
	if [[ ! -f $lock || $dir/package-lock.json -nt $lock ]]; then
		say "Installing $app dependencies"
		(cd "$dir" && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
	fi
	if [[ " ${DASHBOARDS[*]} " == *" $app "* ]]; then
		vars=(VITE_API_URL="https://$API_HOST" VITE_API_TOKEN="$API_TOKEN")
	fi
	say "Building $app"
	rm -rf "$next" "$old"
	(cd "$dir" && env "${vars[@]}" npm run build -- --outDir "$next" --emptyOutDir --logLevel warn)
	[[ -f $next/index.html ]] || die "The $app build has no index.html."
	[[ ! -d $WEB_ROOT/$app ]] || mv "$WEB_ROOT/$app" "$old"
	mv "$next" "$WEB_ROOT/$app"
	rm -rf "$old"
}

if ((BUILD)); then
	mkdir -p "$WEB_ROOT"
	for app in "${APPS[@]}"; do build_app "$app"; done
fi
for app in "${APPS[@]}"; do
	[[ -f $WEB_ROOT/$app/index.html ]] || die "$app has not been built yet: run this without --no-build."
done

# --- nginx -------------------------------------------------------------------------

# Install the sites for the certificates there are now, keeping the old ones if
# nginx refuses the new.
install_nginx_sites() {
	local sites=() app
	for app in "${APPS[@]}"; do sites+=("${HOST[$app]}=$WEB_ROOT/$app"); done
	"$DEPLOY/nginx-sites.sh" "$API_HOST" "$API_PORT" "${sites[@]}" >"$NGINX_SITE.next"
	[[ ! -f $NGINX_SITE ]] || cp "$NGINX_SITE" "$NGINX_SITE.previous"
	mv "$NGINX_SITE.next" "$NGINX_SITE"
	ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/vanguard
	if ! nginx -t -q; then
		if [[ -f $NGINX_SITE.previous ]]; then
			mv "$NGINX_SITE.previous" "$NGINX_SITE"
		else
			rm -f /etc/nginx/sites-enabled/vanguard
		fi
		die "nginx refused the new sites (kept the old ones)."
	fi
	systemctl reload nginx
}

say "Installing the nginx sites"
install_nginx_sites

# --- Certificates ------------------------------------------------------------------

# A nameserver of the zone HOST is in: the first of its parent domains that has any.
zone_nameserver() {
	local zone=${1#*.} ns
	while [[ $zone == *.* ]]; do
		ns=$(dig +short NS "$zone" | head -n 1)
		[[ -z $ns ]] || {
			printf '%s' "$ns"
			return 0
		}
		zone=${zone#*.}
	done
	return 1
}

# HOST's addresses, from its zone's own nameserver when dig is there. Let's Encrypt
# asks afresh too, while resolvers keep the old answer for a while after a record
# changes (half an hour for appbaksho.com's wildcard).
addresses() {
	local ns
	if command -v dig >/dev/null && ns=$(zone_nameserver "$1"); then
		dig +short A "$1" "@$ns" | grep -E '^[0-9.]+$' | sort -u
	else
		getent ahostsv4 "$1" | awk '{print $1}' | sort -u
	fi
}

# Whether every address HOST's DNS gives is this server's (a host can still point
# elsewhere, e.g. at the domain's wildcard record).
points_here() { [[ $(addresses "$1") == "$PUBLIC_IP" ]]; }

# A certificate for each host that has none yet and whose DNS points here. They
# renew with the server's other certificates, reloading nginx.
issue_certs() {
	local host app issued=0 waiting=() hosts=("$API_HOST")
	for app in "${APPS[@]}"; do hosts+=("${HOST[$app]}"); done
	for host in "${hosts[@]}"; do
		[[ ! -f /etc/letsencrypt/live/$host/fullchain.pem ]] || continue
		if ! points_here "$host"; then
			waiting+=("$host")
			continue
		fi
		say "Getting a certificate for $host"
		if certbot certonly --webroot -w "$ACME_ROOT" -d "$host" --cert-name "$host" \
			--non-interactive --agree-tos --keep-until-expiring --quiet \
			--deploy-hook "systemctl reload nginx"; then
			issued=1
		else
			warn "No certificate for $host (see /var/log/letsencrypt/letsencrypt.log)."
		fi
	done
	((!issued)) || install_nginx_sites
	((${#waiting[@]} == 0)) ||
		warn "Served over plain HTTP until their DNS points at $PUBLIC_IP (then run this again): ${waiting[*]}"
}

if command -v certbot >/dev/null; then
	issue_certs
else
	warn "certbot is not installed: every site is served over plain HTTP."
fi

# --- Summary -----------------------------------------------------------------------

scheme() { [[ -f /etc/letsencrypt/live/$1/fullchain.pem ]] && echo https || echo http; }

printf '\n%sDLAS is deployed%s\n' "$BOLD" "$RESET"
row() { printf '  %-32s %s\n' "$1" "$2"; }
row "$(scheme "$API_HOST")://$API_HOST" "backend (pm2 vanguard-api, 127.0.0.1:$API_PORT)"
row "" "Twilio: POST https://$API_HOST/telephony/voice (hotline),"
row "" "/telephony/voice?line=helpline, /telephony/status"
row "NID registry" "pm2 vanguard-nid, 127.0.0.1:$NID_PORT (not public)"
for app in "${APPS[@]}"; do row "$(scheme "${HOST[$app]}")://${HOST[$app]}" "$app"; done
row "Database" "$DATA_DIR/dlas.db"
health=$(curl -fsS "http://127.0.0.1:$API_PORT/health")
row "Health" "$health"
if [[ $health == *'"sms_dry_run":false'* ]]; then
	warn "SMS is LIVE: real messages will be sent."
fi
printf '%s%s%s\n' "$GREEN" "Logs: pm2 logs vanguard-api / vanguard-nid" "$RESET"

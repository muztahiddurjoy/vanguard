# Deploying on the VPS

`deploy/deploy.sh` runs DLAS on a Linux server with nginx, pm2, Node.js 20+ and `uv`
(it is set up on the VPS at `93.127.172.118`, in `/root/vanguard`). Each part has its own
subdomain of `appbaksho.com`:

| Address | What | Served by |
| --- | --- | --- |
| `https://dlao.appbaksho.com` | DLAO dashboard | nginx, static build |
| `https://lawyer.appbaksho.com` | Panel lawyers' dashboard | nginx, static build |
| `https://court.appbaksho.com` | Courts' dashboard | nginx, static build |
| `https://prison.appbaksho.com` | Jails' dashboard | nginx, static build |
| `https://legalaid.appbaksho.com` | Legal aid app (`vanguard-digital-leagal-aid/`) | nginx, static build |
| `https://dlas-api.appbaksho.com` | Backend: the dashboards' API and the phone lines | pm2 `vanguard-api` on `127.0.0.1:3130` |
| (not public) | NID registry, called only by the backend | pm2 `vanguard-nid` on `127.0.0.1:3131` |

Both services listen on localhost only. The dashboards are plain files, so they need no
process of their own. The database and uploaded documents are in `/var/lib/vanguard`, and
the builds are in `/var/www/vanguard`.

## DNS

Each subdomain needs an `A` record for the VPS. `appbaksho.com`'s DNS is at Vercel, and its
wildcard record (`*`) sends every other subdomain to Vercel.

| Type | Name | Value |
| --- | --- | --- |
| A | `dlao` | `93.127.172.118` |
| A | `lawyer` | `93.127.172.118` |
| A | `court` | `93.127.172.118` |
| A | `prison` | `93.127.172.118` |
| A | `legalaid` | `93.127.172.118` |
| A | `dlas-api` | `93.127.172.118` |

```bash
for name in dlao lawyer court prison legalaid dlas-api; do
  vercel dns add appbaksho.com "$name" A 93.127.172.118
done
```

Until its record points at the VPS, a subdomain is served over plain HTTP. Once it does,
running `deploy/deploy.sh` again gets it a Let's Encrypt certificate and switches it to HTTPS.
The certificates renew with the server's others.

## Deploying

```bash
ssh root@93.127.172.118
cd /root/vanguard && git pull
deploy/deploy.sh                # everything
deploy/deploy.sh --no-build     # services, nginx and certificates only (keeps the builds)
deploy/deploy.sh --seed-demo    # also add the demo court and jail records
```

Each run does the following:

- Installs the Python requirements when they change.
- Restarts both services and waits for their `/health`.
- Rebuilds every web app and swaps each build in at once.
- Regenerates the nginx sites (`/etc/nginx/sites-available/vanguard`, from
  `deploy/nginx-sites.sh`) and keeps the old ones if `nginx -t` refuses the new.
- Gets any certificates that are missing.

The database is kept. The demo records (the court and jail staff demo accounts' cases and
prisoners) are added only with `--seed-demo`, and never twice.

## Settings

The first run writes `server/.env` and `nid-server/.env` (mode 600) with:

- `ENVIRONMENT=production`, so Twilio signatures are checked and the NID registry needs its key.
- New secrets: `API_TOKEN`, `NID_HASH_KEY` and the registry key both services share.
- `LOG_LEVEL=INFO`.
- `SMS_DRY_RUN=true`.

Add the model, voice and Twilio keys to `server/.env` (see `server/.env.example`), then
run `deploy/deploy.sh --no-build`. The script sets the hosts, ports and data paths itself.
Keep `NID_HASH_KEY`: the National ID numbers already stored are hashed with it.

The dashboards' builds carry the backend's `API_TOKEN`, so anyone who opens a dashboard can
read it. If you change the token, rebuild (`deploy/deploy.sh`).

## Phone lines

Point the Twilio numbers at the backend:

| Line | Webhook (POST) |
| --- | --- |
| Hotline | `https://dlas-api.appbaksho.com/telephony/voice` |
| AI helpline | `https://dlas-api.appbaksho.com/telephony/voice?line=helpline` |
| Status callback | `https://dlas-api.appbaksho.com/telephony/status` |

## Looking after it

| Task | Command |
| --- | --- |
| Logs | `pm2 logs vanguard-api`, `pm2 logs vanguard-nid` |
| Restart | `pm2 restart vanguard-api` |
| Health | `curl -s http://127.0.0.1:3130/health` |

To back up the database while the backend runs:

```bash
/root/vanguard/server/.venv/bin/python -c 'import sqlite3, sys
sqlite3.connect("/var/lib/vanguard/dlas.db").backup(sqlite3.connect(sys.argv[1]))' \
  "/root/db-backups/dlas-$(date +%F).db"
```

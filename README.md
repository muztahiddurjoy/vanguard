# Digital Legal Aid System (DLAS)

Legal aid for a district office in Bangladesh, from the first phone call to the officer's
decision.

| Part | What it is | Port |
| --- | --- | --- |
| [`server/`](server/README.md) | The backend: AI hotline intake by phone (live speech-to-text), triage, SMS notices, the AI query helpline, and the officer API | 8000 |
| [`nid-server/`](nid-server/README.md) | A National ID registry with fictional citizens, parent links and registered SIMs | 8100 |
| [`dlao-dashboard/`](dlao-dashboard/README.md) | The District Legal Aid Officer's dashboard (English and বাংলা) | 5173 |

## How a case moves

1. **Someone calls the hotline.** The AI asks who the application is for (themselves, or their
   father, mother, brother or sister), the caller's name, and three NID security questions:
   father's name, permanent district and date of birth. It confirms them, and any relative,
   against the NID registry, then asks what happened and who it is against. It notes
   everything the caller says.
2. **Danger changes everything.** If the caller seems to be held hostage, or the call is cut
   while they describe violence, the case is marked **Do not call this number**. Calls and SMS
   to them are blocked, and what they said before the line went dead is kept.
3. **The AI marks, the officer decides.** Every case is marked *can be resolved through
   advice*, *through mediation*, or *sensitive*, with a priority and its reasons. Officers
   confirm or change each mark on the dashboard.
4. **Both sides hear by SMS** (ADN SMS). The person who filed gets a tracking number. The
   person the case is against, found through the SIMs registered under their NID, is asked to
   visit the DLAO office. That notice waits for an officer whenever sending it could put the
   applicant at risk.
5. **The helpline number in each SMS reaches an AI.** It tells a caller their case's progress
   from the tracking number, and answers questions about notices, the office, documents and
   mediation.

## Run everything locally

```bash
./start.sh
```

This starts the NID registry, the backend with its SQLite database (`server/dlas.db`, created
at startup), an ngrok tunnel for the phone lines and the dashboard, then prints their
addresses and the Twilio webhooks. The first run installs the dependencies and creates
`server/.env`. Each service's output is shown with its name and kept in `.logs/`. Ctrl-C
stops everything, and so does any one service stopping.

| Option | What it does |
| --- | --- |
| `--no-ngrok` | No tunnel: everything but real phone calls works |
| `--no-dashboard` | Backend only |
| `--reset-db` | Starts with an empty database (after a schema change); the old file is kept as a backup |
| `--install` | Reinstalls every dependency first |

The tunnel uses `PUBLIC_BASE_URL` from `server/.env` as its domain, so the Twilio numbers
keep working between runs. Without one, ngrok picks a new URL each time; the backend is
given that URL, and the script warns you to repoint the numbers. The script needs `uv` (or
Python 3.12), Node.js and a signed-in `ngrok`.

Or start each part by hand:

```bash
# 1. NID registry
cd nid-server && uv venv --python 3.12 .venv && uv pip install -r requirements-dev.txt --python .venv/bin/python
.venv/bin/uvicorn app.main:app --port 8100 &

# 2. Backend (SMS stays a dry run unless you configure ADN and SMS_DRY_RUN=false)
cd ../server && uv venv --python 3.12 .venv && uv pip install -r requirements-dev.txt --python .venv/bin/python
cp .env.example .env    # NID_SERVER_URL=http://localhost:8100 is already set
.venv/bin/uvicorn app.main:app --port 8000 &

# 3. Dashboard, showing the backend's cases
cd ../dlao-dashboard && npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Try a call without a phone line at <http://localhost:8000/docs>. Start with
`POST /intake/conversations`, then send each answer to `/intake/conversations/{id}/turns`.
[`nid-server/README.md`](nid-server/README.md) lists people you can call as, such as Rafiqul
Islam applying for his mother.

To hear the voice path (speech-to-text, the agents and the spoken replies), set
`OPENAI_API_KEY` and the ElevenLabs keys in `server/.env` (and `LLM_PROVIDER=openai` for
the agents to use `gpt-6-luna`), then call a line from recorded answers with
`scripts/simulate_call.py`. For real calls through Twilio, see *Telephony* in
[`server/README.md`](server/README.md).

> The registry's people are fictional, but their phone numbers may belong to real
> subscribers. Keep `SMS_DRY_RUN=true`, or list only your own numbers in `SMS_ALLOWLIST`,
> while it is connected.

# Digital Legal Aid System (DLAS)

Legal aid for a district office in Bangladesh, from the first phone call to the officer's
decision.

| Part | What it is | Port |
| --- | --- | --- |
| [`server/`](server/README.md) | The backend: AI hotline intake by phone (live speech-to-text), triage, SMS notices, the AI query helpline, and the officer API | 8000 |
| [`nid-server/`](nid-server/README.md) | A National ID registry with fictional citizens, parent links and registered SIMs | 8100 |
| [`dlao-dashboard/`](dlao-dashboard/README.md) | The District Legal Aid Officer's dashboard (English and বাংলা) | 5173 |
| [`lawyer-dashboard/`](lawyer-dashboard/README.md) | The panel lawyers' dashboard: their cases and hearings, updates from court, and each case's court record (English and বাংলা) | 5174 |
| [`court-dashboard/`](court-dashboard/README.md) | The courts' dashboard: the court's register and cause lists, and legal aid applications for people before the court, with e-KYC and e-signature (English and বাংলা) | 5175 |
| [`prison-dashboard/`](prison-dashboard/README.md) | The jails' dashboard: prisoners and the court cases they are held on, the production list, and legal aid applications for prisoners, with e-KYC and e-signature (English and বাংলা) | 5176 |

## How a case moves

1. **Someone calls the hotline.** The AI asks whether they want to file a new case or hear the
   progress of one they filed. For progress it asks for the tracking number and reads out where
   the case stands. For a new case it listens: it asks nothing until the caller has said what
   happened, and a caller who starts telling it straight away, or who is in danger, is heard at
   once. Danger in those first words gets the 999 line at once. Once
   it sounds like a case, the AI asks only what it still needs: who the application is for,
   the caller's name and three NID security questions (father's name, permanent district,
   date of birth). If the caller cannot answer, it searches the NID registry itself, through
   the SIM they are calling from. It notes everything the caller says.
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
5. **Courts and jails apply directly.** Court staff and the jail's legal aid desk submit an
   application for someone before them on their own dashboards, so the office never retypes
   it. They first check who the person is against the NID registry (e-KYC: NID number, date of
   birth and name); only then can they add the person's e-signature, drawn on screen or
   scanned. The application arrives in the officer's queue like any other, marked with the
   court or jail that sent it, and someone in custody is at least high priority. The court or
   jail follows its progress (stage, lawyer, next hearing) and hands the tracking number to
   the applicant.
6. **One record of the person's court cases.** Courts keep their register there (case
   numbers, parties, what happened at each hearing, the lawyers who appeared, the daily cause
   list), and jails keep their prisoners, linked to the cases they are held on. An officer
   sees the records linked to a case, and the case's panel lawyer sees the same for their
   own cases: the history, the previous lawyers, the next listing and where the client is
   held, without asking anyone for it again. Each role sees only what its work needs, every
   look is recorded, and records a court marks restricted (a juvenile's case, a sealed record)
   never appear as anyone's previous record.
7. **The helpline number in each SMS reaches an AI.** It tells a caller their case's progress
   from the tracking number (and the next court date), and answers questions about notices, the
   office, documents and mediation.
8. **Mediation, when the officer decides to try it.** Both parties get an SMS notice with the
   date, the place, a notice number and the helpline number. A party who does not understand
   it calls the helpline, says the notice number and hears what the notice means, and can ask
   when, where and what to bring. The officer records who came. Someone who misses two
   sessions in a row is looked for through their Union Digital Centre, which is sent the next
   date to tell them in person; for an applicant whose safety is at risk, that waits for an
   officer.
9. **A panel lawyer takes the case to court.** The officer assigns one of the district's panel
   lawyers, who sees the case on their own dashboard and reports after every hearing: what
   happened, the next date, and the order sheet. A report is due every two weeks and within
   three days of each hearing. The officer sees each report at once; a lawyer who stops
   reporting is flagged, and one who stops across several cases raises a pattern alert, from
   which the officer can move their cases to another lawyer.

## Run everything locally

```bash
./start.sh
```

This starts the NID registry, the backend with its SQLite database (`server/dlas.db`, created
at startup, with the demo court and jail records added), an ngrok tunnel for the phone lines
and the four dashboards, then prints their
addresses, the Twilio webhooks and whether the AI, speech-to-text and the voice are working
(the voice is checked with ElevenLabs at startup). The first run installs the dependencies and creates
`server/.env`. Each service's output is shown with its name and kept in `.logs/`. Ctrl-C
stops everything, and so does any one service stopping.

| Option | What it does |
| --- | --- |
| `--no-ngrok` | No tunnel: everything but real phone calls works |
| `--no-dashboard` | Backend only (no dashboards) |
| `--reset-db` | Starts with an empty database (after a schema change); the old file is kept as a backup |
| `--no-seed` | Leaves out the demo court cases, cause lists and prisoners |
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
.venv/bin/python -m scripts.seed_records    # demo court cases, cause lists and prisoners
.venv/bin/uvicorn app.main:app --port 8000 &

# 3. Dashboard, showing the backend's cases
cd ../dlao-dashboard && npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev &

# 4. Panel lawyers' dashboard, on the same backend (port 5174)
cd ../lawyer-dashboard && npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev &

# 5. Courts' and jails' dashboards, on the same backend (ports 5175 and 5176)
for app in court-dashboard prison-dashboard; do
  (cd ../$app && npm install && echo "VITE_API_URL=http://localhost:8000" > .env.local && npm run dev &)
done
```

To follow an application from a jail: on the jail dashboard, sign in as Nasima Khatun
(`JS-08`), open Jalal Uddin (`RCJ-2026-0412`) and apply for legal aid. Verify him by e-KYC
(NID `2854106397`, born 5 June 1990), let him sign on screen and submit. The case is in the DLAO
dashboard's queue at high priority, marked *In custody*; its **Court and jail records** tab shows
his charge, the lawyer who withdrew, his next listing and his previous case. Assign it to a
panel lawyer, and the jail sees the lawyer's name at once. Court staff do the same from the
court dashboard (`CS-11`), for anyone on their register.

To follow a case from the officer to the lawyer and back: assign a panel lawyer on the DLAO
dashboard (for example Adv. Nasrin Jahan, `LAW-12`), sign in as that lawyer on the lawyers'
dashboard, send an update from court, then open the case's **Court progress** tab on the DLAO
dashboard.

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

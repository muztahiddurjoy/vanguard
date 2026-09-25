# DLAS Backend

API for the Digital Legal Aid System: intake from the hotline, Union Digital Centres
(UDC) and the web, with callers' identities checked against the National ID (NID)
registry; AI-assisted triage, document review and settlement drafting; SMS notices to
both parties; an AI helpline that answers questions about a case; and the District
Legal Aid Officer (DLAO) dashboard's queues, alerts and decisions.

FastAPI · SQLAlchemy 2 · LangGraph · Claude (optional) · Twilio media streams · ElevenLabs TTS · ADN SMS · NID registry (`../nid-server`)

## Quick start

```bash
cd server
uv venv --python 3.12 .venv          # or: python3.12 -m venv .venv
uv pip install -r requirements-dev.txt --python .venv/bin/python
cp .env.example .env                 # every key is optional in development
.venv/bin/uvicorn app.main:app --reload
```

Open <http://localhost:8000/docs> for the interactive API. Without any credentials
the service still runs end to end: SMS is a dry run, the agents use their rule-based
path, and the phone line answers with a spoken fallback. To check callers' identities,
also run the NID registry (`../nid-server`, port 8100) and set `NID_SERVER_URL`;
without it, intake skips the security questions and records applicants as unverified.

An existing development `dlas.db` from before this schema needs deleting (tables are
created at startup; there are no migrations yet).

| Command | What it does |
| --- | --- |
| `.venv/bin/pytest` | Tests (unit, API and a simulated phone call) |
| `.venv/bin/ruff check . && .venv/bin/ruff format --check .` | Lint and formatting |
| `.venv/bin/mypy` | Type check |
| `docker build -t dlas-backend .` | Production image (serves on port 8000) |
| `.venv/bin/python -m scripts.dashboard_fixture` | Refresh the dashboard's API contract fixture |

If your shell exports a `PYTHONPATH` (ROS, for example), run the tools with
`env -u PYTHONPATH …` so foreign pytest plugins are not loaded.

## Structure

```
app/
  main.py  config.py  database.py
  models/     case.py (cases, APP→DLAS IDs, referrals, incidents, mediation sessions)
              party.py (safety level, provenance, accessibility, safe windows, duplicate reviews)
              document.py (files, T6 checklist items, T11 signatures)
              audit.py (hash-chained ledger, T9 sync receipts)
  agents/     state.py  llm.py (optional Claude access)  spoken.py (reading callers' answers)
              t5_intake.py  t6_document.py  t7_settlement.py  t8_triage.py
              helpline.py (the AI query helpline)
  routers/    intake.py  dlao.py  duplicates.py  referrals.py  incidents.py
              mediation.py  sync.py  helpline.py  telephony.py
  services/   safe_contact.py  adnsms.py  crypto.py  elevenlabs.py  stream_manager.py
              nid_registry.py  notices.py (SMS to both parties)  case_status.py
scripts/      dashboard_fixture.py
tests/
```

## Features and endpoints

| | Feature | Where |
| --- | --- | --- |
| T1 | Alerts: overdue, lawyer inactivity, jurisdiction escalation, untriaged critical cases | `GET /dlao/alerts`, `alerts` queue |
| T2 | Referrals between district offices; ping-pong is escalated, not forwarded | `/referrals` |
| T3 | Group incidents linking cases from one event, with suggestions | `/incidents` |
| T4 | Fuzzy duplicate detection on every intake; merge blocked when NIDs differ | `/duplicates` |
| T5 | Conversational intake for the hotline, UDC and web: NID security questions, filing for a parent or sibling, respondent lookup, call notes, cut calls | `/intake/conversations`, telephony |
| T6 | Document reading (OCR), summaries and a missing-documents checklist | `POST /intake/cases/{ref}/documents` |
| T7 | Settlement drafting under Section 21C, LASA 2000 | `POST /mediation/cases/{ref}/settlement-draft` |
| T8 | Triage: categorization → compliance → urgency → track (advice / mediation / sensitive mark) | runs on every intake; `/dlao/cases/{ref}/triage/*`, `/dlao/cases/{ref}/track` |
| T9 | Idempotent offline batch sync for the PWA | `POST /sync/batch` |
| T11 | Ed25519 e-signatures on approved settlements | `POST /mediation/signatures` |
| | SMS notices: tracking number to the filer, "visit the DLAO office" to the respondent | on every intake; `POST /dlao/cases/{ref}/respondent-notice` |
| | AI query helpline: case progress by tracking number, notices, office, documents, mediation | `/helpline/*`, telephony `?line=helpline` |
| | Do-not-call: hostage signs or a call cut during violence block all calls and SMS | `POST /dlao/cases/{ref}/safety` lifts it |

Dashboard endpoints (`/dlao/...`) return the dashboard's own `LegalCase` shape
(camelCase, same priority, queue, flag and triage-factor keys), so
`dlao-dashboard` can replace its sample data with them. A case is addressed by
either reference: `APP-2026-001` or, once promoted, `DLAS-2026-045`.

## A call to the hotline, step by step

1. **Who is it for?** The caller applies for themselves, or for their father, mother,
   brother or sister (or someone else, such as a neighbour).
2. **Who is calling?** The caller gives their name, then answers three security
   questions from their NID: father's name, permanent district and date of birth.
   Callers cannot read a 10- or 17-digit NID aloud, so these stand in for it. Exactly
   one matching registry record verifies them. A mismatch gets one retry; after that,
   or if the registry is down, intake carries on and the application is marked
   unverified. Nobody is turned away.
3. **The relative.** A parent is found through the caller's NID parent links and a
   sibling through shared parents; the name the caller gives must match. The
   applicant's details (address, NID, parents, date of birth) then come from the
   record.
4. **What happened**, and **who it is against**. The respondent is looked up by name,
   father's name and district to find the SIMs registered under their NID. The caller
   is asked whether it is safe to send them an SMS now.
5. **Contact.** The caller ID is used for someone applying for themselves; otherwise
   the caller is asked for a safe number, and when it is safe to call.
6. **The application** is created with everything said as call notes, triaged by T8
   (priority and the advice / mediation / sensitive mark), and the notices go out
   (below). The caller hears their tracking number, digit by digit.

Throughout, T5 listens for danger. Immediate danger ends the call with the 999 line
and an escalated, critical application. Signs that the caller is being held
("locked me in", "আটকে রেখেছে") make the applicant **do-not-call**: the caller is told
we will not call back, intake carries on quietly, and if the line goes dead what was
said is still filed. A call cut while the caller was describing violence is marked
do-not-call too. Any other cut call that reached the problem is filed and flagged
`callDropped`.

## SMS notices

- **Whoever filed** gets the tracking number and `HELPLINE_NUMBER`, on the number they
  gave (or their caller ID, or their first registered SIM).
- **The respondent** is told a case has been filed and asked to visit the District
  Legal Aid Office, with `HELPLINE_NUMBER` for questions, on every SIM registered
  under their NID except any number the applicant's side uses.

Both go through `safe_contact`, so a do-not-contact applicant gets nothing and a
restricted one only a neutral text inside their safe window. The respondent notice is
**held** for an officer, and the hold is audited, if the caller did not agree to it, if
the case is marked sensitive or do-not-call, if it was an emergency, or if the
caller's identity was not verified. An officer can release it with a written reason.

## The AI helpline

The number in every SMS reaches `agents/helpline.py`, over the phone
(`/telephony/voice?line=helpline`) or `/helpline/conversations`. Given a tracking
number, it reads out only the stage the case has reached, the next mediation date and
the officer's decision on how it will be resolved (`services/case_status.py`). Anyone
could say a number, so it gives no names, narrative or contact details. It explains
what the respondent's SMS means, and answers questions about the office, documents,
mediation, fees and applying from fixed facts. Claude, when configured, answers other
questions using the same facts, and rules take over on any failure.

## Safety by design

- **Every outbound contact goes through `services/safe_contact.py`.** A restricted
  party (for example, someone whose phone is monitored) is contacted only inside their
  weekly safe window. Restricted, caution and shared-phone parties only ever receive
  neutral text, because an SMS stays on the phone after the window closes. Every
  decision, sent or blocked, is audited without the message body. The window maths
  and test cases match the dashboard's `lib/safe-contact.ts`.
- **Immutable audit ledger.** Overrides, access (opening a case), contact decisions,
  signatures and sync operations are appended to a SHA-256 hash chain.
  `GET /dlao/audit/verify` finds the first altered entry. The ORM refuses updates and
  deletes; also revoke `UPDATE`/`DELETE` on `audit_entries` for the application's
  database role in production.
- **Do-not-call.** Hostage signs, or a call cut during violence, set the applicant's
  safety level to `no_contact`: every call and SMS is blocked and the dashboard shows
  why. Triage only ever raises a safety level; lifting it needs an officer and a reason
  (`POST /dlao/cases/{ref}/safety`).
- **Real numbers in test data.** The NID registry's fictional records use well-formed
  numbers that may belong to real people. Keep `SMS_DRY_RUN=true`, or list the numbers
  you own in `SMS_ALLOWLIST`, whenever the registry is connected.
- **Humans decide.** Triage priority comes from transparent rules and is only a
  recommendation. The advice / mediation / sensitive track is a mark the officer
  confirms or changes (with a reason); Claude may choose between advice and mediation
  but never lowers a sensitive mark. Overrides need a 20+ character justification. Duplicates are never
  merged automatically. Settlement drafts need officer approval before anyone can sign,
  and drafting is refused when violence is on record, unless the officer acknowledges
  the risk with an audited reason.
- **Minimal personal data.** NIDs are stored only as a keyed HMAC (`NID_HASH_KEY`)
  plus the last four digits. Phone numbers are masked in lists; the full number
  appears only in case detail, which is access-logged.
- **Emergencies.** If a caller signals immediate danger, T5 tells them to call 999 and
  creates a critical, escalated application for an urgent callback, even if details
  are missing. Caller ID is used when no number was given.

## AI agents and Claude

The agents are LangGraph graphs that work without any model. When `ANTHROPIC_API_KEY`
is set, Claude (`LLM_MODEL`, default `claude-opus-5`) is consulted only where rules are
weak:

- **T8:** narratives the keyword rules cannot categorize confidently (priority stays
  rule-based).
- **T5:** free-form speech (validated formats such as phone numbers still come from
  rules).
- **T6:** reading scans and PDFs.
- **T7:** drafting. A draft that drops a term, a party or the statutory reference fails
  review and is replaced by the template.

Requests use structured outputs and server-side refusal fallback (`fallbacks: "default"`).
Any failure (network, rate limit, refusal, invalid output) falls back to rules.

## Offline sync (T9)

```json
POST /sync/batch
{"device_id": "udc-tablet-7",
 "operations": [
   {"idempotency_key": "9f1c…", "op": "create_intake", "payload": {…UDC form…}},
   {"idempotency_key": "a2d4…", "op": "attach_document",
    "payload": {"case_client_ref": "9f1c…", "content_type": "image/jpeg", "data_b64": "…"}}
 ]}
```

Each result is one of the following:

| Result | Meaning |
| --- | --- |
| `applied` | The operation ran for the first time. |
| `replayed` | The key was seen before; the stored result is returned and nothing re-runs. |
| `rejected` | Invalid input. The rejection is stored, so a replay returns the same answer. |
| `conflict` | The same key was sent with different content. |
| `deferred` | The case it refers to has not synced yet. Nothing is stored; retry later. |
| `error` | Server error. Nothing is stored; retry later. |

Operations run in order. `case_client_ref` points at the key of the `create_intake`
operation that made the case.

## E-signatures (T11)

1. The officer approves the draft (`POST /mediation/documents/{id}/approve`), which
   freezes its text and SHA-256.
2. `GET /mediation/documents/{id}` returns `signingMessage`, which is
   `dlas-t11-v1|{document_id}|{sha256}`.
3. The signer's device signs the UTF-8 bytes with Ed25519 and posts the raw 32-byte
   public key and the 64-byte signature (base64) with `signed_sha256`.
4. The server recomputes everything from its own copy. A signature over a stale
   version, by a non-signer, or a second one from the same party, is refused. When all
   required parties have signed, the document is `executed`.

## Telephony

1. Point the application hotline's voice webhook at `POST {PUBLIC_BASE_URL}/telephony/voice`
   (add `?lang=en` for an English line) and the status callback at `/telephony/status`.
   Point the query helpline's number (`HELPLINE_NUMBER`) at
   `/telephony/voice?line=helpline`.
2. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Choose an `ELEVENLABS_MODEL_ID`
   that supports Bangla for the voice you use.
3. Set `TWILIO_AUTH_TOKEN`. Signature checks are always on when
   `ENVIRONMENT=production`.
4. **Plug in speech-to-text.** No STT provider is bundled. Implement `Transcriber` in
   `services/stream_manager.py` (feed μ-law 8 kHz audio; emit `speech_started` and
   `final` events) and return it from `build_transcriber`. Until then, callers hear a
   short message (call 999 if in danger; apply at a UDC) and the call ends.

## Configuration

See `.env.example` for every setting. For production, set at least:

- `ENVIRONMENT=production`
- `DATABASE_URL` (Postgres)
- `API_TOKEN`
- `NID_HASH_KEY` (the app refuses to start with the development default)
- `TWILIO_AUTH_TOKEN`
- `SMS_DRY_RUN=false` with the ADN credentials
- `NID_SERVER_URL` and `NID_SERVER_API_KEY` (the registry's `NID_API_KEY`)
- `HELPLINE_NUMBER` (the number routed to the query helpline)

## Known limitations

- **Auth:** a shared bearer token plus an `X-Officer-Id` header for the audit trail.
  Per-officer sign-in and roles are still to do.
- **Schema:** tables are created at startup; add Alembic before the first production
  migration.
- **T5 state:** conversation state lives in process memory. Run a single worker, or
  switch to a shared LangGraph checkpointer (Postgres or Redis).
- **T11 identity:** a signature proves the signer holds the key, not who they are.
  Binding keys to parties (for example, enrolment at a UDC) is still to do.
- **Telephony:** needs a speech-to-text adapter (see above). Live transfer to an
  officer during an emergency is not implemented.
- **ADN SMS:** the request fields follow ADN's secure send-SMS API. Confirm them
  against your ADN account's documentation before going live.
- **Keyword lists:** T6 checklists and T8 terms are a reviewed starting point, not
  legal advice. Have them checked by the legal aid office. The hostage terms are
  person-specific on purpose ("আটকে রেখেছে" alone also means withheld wages), and a
  past event can still trip them: an officer lifts do-not-call after checking.
- **NID registry:** `nid-server` holds fictional records. A real Election Commission
  integration needs its own agreement, client and data-protection review.
- **Helpline tracking** is by the eight-digit number alone, with no rate limit yet;
  it reveals only the stage. Add rate limiting before a public web tracker.

# DLAS Backend

API for the Digital Legal Aid System: intake from the hotline, Union Digital Centres
(UDC) and the web, with callers' identities checked against the National ID (NID)
registry; AI-assisted triage, document review and settlement drafting; SMS notices to
both parties; an AI helpline that answers questions about a case; the District
Legal Aid Officer (DLAO) dashboard's queues, alerts and decisions; applications that
courts and jails submit directly, with e-KYC and e-signature; the courts' and jails'
records of cases and prisoners; and mediation notices, attendance and Union Digital
Centres asked to reach someone who keeps missing it.

FastAPI · SQLAlchemy 2 · LangGraph · Claude or OpenAI (optional) · Twilio media streams · OpenAI `gpt-live-transcribe` · ElevenLabs TTS · ADN SMS · NID registry (`../nid-server`)

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
| `.venv/bin/python -m scripts.seed_records` | Add the demo court cases, cause lists, prisoners and one jail application (safe to re-run; refuses in production without `--force`) |
| `.venv/bin/python -m scripts.seed_cases` | Then add the DLAO dashboard's demo cases, dated as they happened (safe to re-run; refuses in production without `--force`) |
| `.venv/bin/python -m scripts.simulate_call turn1.wav …` | Call a phone line from recorded turns, without Twilio (see *Test a call without a phone*) |

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
              records.py (court cases, hearings, lawyers, cause lists, prisoners, e-KYC checks,
                          applications from courts and jails, links to legal aid cases)
              mediation.py (attendance, notices, UDC notices)
  agents/     state.py  llm.py (optional Claude or OpenAI access)  spoken.py (reading callers' answers)
              t5_intake.py  t6_document.py  t7_settlement.py  t8_triage.py
              helpline.py (the AI query helpline)  hotline_menu.py (new case or status?)
  routers/    intake.py  dlao.py  duplicates.py  referrals.py  incidents.py
              mediation.py  sync.py  helpline.py  telephony.py  lawyer.py
              court.py  prison.py  records.py (the DLAO's view of them)  udc.py
  services/   safe_contact.py  adnsms.py  crypto.py  elevenlabs.py  stream_manager.py
              speech_to_text.py (gpt-live-transcribe)  audio.py (μ-law, resampling, voice detection)
              nid_registry.py  notices.py (SMS to both parties)  case_status.py
              courts.py  prisons.py  udc.py  panel.py (rosters)
              ekyc.py  records.py (who may see which record)  institution.py (applications
              from courts and jails)  mediation.py (notices, no-shows, UDCs)
scripts/      dashboard_fixture.py  simulate_call.py  seed_records.py  seed_cases.py
tests/
```

## Features and endpoints

| | Feature | Where |
| --- | --- | --- |
| T1 | Alerts: overdue, lawyer inactivity, jurisdiction escalation, untriaged critical cases | `GET /dlao/alerts`, `alerts` queue |
| T2 | Referrals between district offices; ping-pong is escalated, not forwarded | `/referrals` |
| T3 | Group incidents linking cases from one event, with suggestions | `/incidents` |
| T4 | Fuzzy duplicate detection on every intake; merge blocked when NIDs differ | `/duplicates` |
| T5 | Conversational intake for the hotline, UDC and web: listens to what happened first, NID security questions with a SIM search when they fail, filing for a parent or sibling, respondent lookup, call notes, cut calls | `/intake/conversations`, telephony |
| T6 | Document reading (OCR), summaries and a missing-documents checklist | `POST /intake/cases/{ref}/documents` |
| T7 | Settlement drafting under Section 21C, LASA 2000 | `POST /mediation/cases/{ref}/settlement-draft` |
| T8 | Triage: categorization → compliance → urgency → track (advice / mediation / sensitive mark) | runs on every intake; `/dlao/cases/{ref}/triage/*`, `/dlao/cases/{ref}/track` |
| T9 | Idempotent offline batch sync for the PWA | `POST /sync/batch` |
| T11 | Ed25519 e-signatures on approved settlements | `POST /mediation/signatures` |
| | SMS notices: tracking number to the filer, "visit the DLAO office" to the respondent | on every intake; `POST /dlao/cases/{ref}/respondent-notice` |
| | AI query helpline: case progress by tracking number, notices, office, documents, mediation; also on the hotline, which first asks "new case or status?" | `/helpline/*`, telephony `?line=helpline` and the hotline |
| | Do-not-call: hostage signs or a call cut during violence block all calls and SMS | `POST /dlao/cases/{ref}/safety` lifts it |
| | Courts: the register (parties, hearings, lawyers), cause lists, and applications with e-KYC and e-signature | `/court/*` (court-dashboard) |
| | Jails: prisoners and the cases they are held on, the production list, and applications | `/prison/*` (prison-dashboard) |
| | The records linked to a case, for the officer and the case's panel lawyer; search and link | `GET /dlao/cases/{ref}/records`, `/dlao/records/search`, `GET /lawyer/cases/{ref}/records` |
| | Mediation notices to both parties, attendance, and UDCs asked to reach a party who keeps missing it | `/mediation/*`, `/udc/*` |

Dashboard endpoints (`/dlao/...`) return the dashboard's own `LegalCase` shape
(camelCase, same priority, queue, flag and triage-factor keys), so
`dlao-dashboard` can replace its sample data with them. A case is addressed by
either reference: `APP-2026-001` or, once promoted, `DLAS-2026-045`.

## A call to the hotline, step by step

1. **New case, or a case already filed?** The line answers "লিগ্যাল এইড। আপনি কি নতুন
   মামলা করতে চান, নাকি আগে করা মামলার অগ্রগতি জানতে চান?" ("Legal aid. Do you want to
   file a new case, or hear the progress of a case you already filed?")
   (`agents/hotline_menu.py`). A caller asking about their case is asked for their
   tracking number and hears its progress from the helpline agent (see *The AI
   helpline*). Nothing is filed for them. Three numbers that cannot be found, or "I
   don't have it", end the search with the SMS and the office to turn to. A caller who
   starts saying what happened, or says anything about danger, goes straight on to
   intake with what they said kept, so the emergency path is never behind the
   question. An answer the line cannot place is asked once more, then the line listens.
   A status caller who wants to file after all, or who says they are in danger, is
   handed to intake the same way.
2. **Then listen.** For a new case the line says "ঠিক আছে। আমি শুনছি, বলুন কী হয়েছে।"
   ("All right. I'm listening, tell me what happened.") and asks nothing until the
   caller has said what happened. While they talk, including at the first question, a
   pause has to be longer (`STT_STORY_END_OF_TURN_MS`) before the line answers, and the
   caller can always talk over the line. "Hello?" and fragments only get encouragement
   to go on.
3. **Does it sound like a case?** A known problem (land, wages, dowry, ...), a warning
   sign, or an account of some length is enough by rules. With a model configured, it
   also reads the account: a case, clearly not a legal matter (told what the line is
   for and given `HELPLINE_NUMBER`), or not said yet. The model can only add: a problem
   the rules know is never turned away. After three tries a short account is taken as
   it is; a caller who never says anything is asked to call again. The account, in
   the caller's own words, is the application's narrative, and anything already said
   (who it is for, who it is against, where they live) is not asked again.
4. **Who is it for?** The caller applies for themselves, or for their father, mother,
   brother or sister (or someone else, such as a neighbour).
5. **Who is calling?** The caller gives their name, then answers three security
   questions from their NID: father's name, permanent district and date of birth.
   Callers cannot read a 10- or 17-digit NID aloud, so these stand in for it. Exactly
   one matching registry record verifies them. A mismatch gets one retry.
6. **When they cannot answer, the registry is searched.** A caller who does not know
   an answer, or whose answers match no one twice, is looked up through the SIM they
   are calling from: if the name they gave is its owner's, or a relative's on the
   owner's NID record (a wife calling on her husband's phone), they are confirmed.
   The case records which way (`identity.callerVerifiedBy`: answers, SIM or a
   relative's SIM) and the dashboard shows it. Otherwise, or if the registry is down,
   intake carries on and the application is marked unverified. Nobody is turned away.
7. **The relative.** A parent is found through the caller's NID parent links and a
   sibling through shared parents; the name the caller gives must match. The
   applicant's details (address, NID, parents, date of birth) then come from the
   record.
8. **Who it is against.** The respondent is looked up by name, father's name and
   district to find the SIMs registered under their NID. If the caller does not know
   those, the respondent is looked for among the applicant's relatives on their NID
   record (a husband by his first name). The caller is asked whether it is safe to
   send them an SMS now.
9. **Contact.** The caller ID is used for someone applying for themselves, unless the
   registry shows the phone belongs to someone else (it may be the abuser's); then,
   as for anyone applying for someone else, the caller is asked for a safe number,
   and when it is safe to call.
10. **The application** is created with everything said as call notes, triaged by T8
   (priority and the advice / mediation / sensitive mark), and the notices go out
   (below). The caller hears their tracking number, digit by digit.

No question is asked more than twice: one the caller cannot answer is recorded as
not known, and an officer follows up.

Throughout, T5 listens for danger, from the first words: the rules' phrases, or the
model hearing that someone is in danger right now. Immediate danger ends the call
with the 999 line and an escalated, critical application. Signs that the caller is being held
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

## Courts and jails

Court staff and jail staff each have a dashboard (`../court-dashboard`,
`../prison-dashboard`) and an API: `/court/*` with `X-Court-Staff-Id`, and `/prison/*` with
`X-Prison-Staff-Id`. The ID must be on the roster (`services/courts.py`,
`services/prisons.py`). Each office sees only its own records; asking for another office's
is a 404, so its record IDs are not confirmed.

- **The court's register.** `GET/POST /court/cases`, `GET/PATCH /court/cases/{id}`, what
  happened at each hearing (`POST .../proceedings`; a judgment disposes the case), the
  lawyers who appeared (`POST .../lawyers`, `POST .../lawyers/{id}/end`), and the daily
  cause list (`GET/PUT /court/cause-lists/{date}`; saving an empty list withdraws it). Case
  numbers match however they were typed (`G.R. 455/2026`, `gr 455/2026`), so a cause list
  entry or a prisoner's case links to the court's record as soon as it is registered.
  A court marks a case **restricted** (a juvenile's, a sealed record): it is never shown as
  anyone's previous record, and an officer cannot link it.
- **The jail's prisoners.** `GET/POST /prison/prisoners`, `GET/PATCH /prison/prisoners/{id}`,
  each with the court cases they are held on, and `GET /prison/court-dates`: listings in any
  court for its prisoners' cases, which is the jail's production list.
- **e-KYC.** `POST /court/ekyc` and `/prison/ekyc` check an NID and date of birth (and the
  name, if given) against the NID registry. A failed check never says which detail was
  wrong. A verified check keeps the registry's record, so what it is used for takes the
  person's details from the registry, never from the form; it can be used once, by the
  office that made it, within `EKYC_CHECK_VALID_MINUTES`. It matches data, not a face or a
  fingerprint: staff check the person in front of them against their NID card.
- **Applications.** `POST /court/applications` and `/prison/applications` (with a
  `client_ref`, so a retry cannot file twice) become an ordinary application: triaged,
  checked for duplicates and audited, with channel `court` or `prison`. Someone in custody
  is flagged `inCustody` and is at least high priority. No SMS goes out (someone in custody
  has no phone); staff hand over the tracking number. The court case, or the prisoner and
  every case they are held on, is linked to it. The applicant's **e-signature** (a PNG or
  JPEG, drawn on screen or scanned, up to 2 MB) is accepted only after a verified e-KYC
  check, at submission or later (`POST .../applications/{ref}/signature`). Staff follow each
  application's stage, lawyer and next hearing, and nothing else of the case.
- **Who sees the records.** The officer reads the records linked to a case
  (`GET /dlao/cases/{ref}/records`): who submitted it and how the applicant was identified,
  each court case with its hearings, lawyers (the previous ones included) and cause list,
  the prisoner, and the person's **previous records**: their other court cases, found by NID
  or by name and father's name. The officer can search the records and link one to a case
  that came in another way (a mother calling about her son in jail). The case's panel lawyer
  reads the same for their own cases (`GET /lawyer/cases/{ref}/records`), without any NID
  digits. Every read, search and write is audited, and only an NID's last four digits ever
  leave the server.

`python -m scripts.seed_records` adds the demo records: five court cases in three courts
with their hearings and cause lists, four prisoners in two jails, and one application from
Rangpur Central Jail. `../start.sh` runs it.

`python -m scripts.seed_cases` (after it) adds the DLAO dashboard's demo cases: the
applications in the dashboard's sample data (`src/data/cases.ts` and `closed-cases.ts`),
made through the API as the office would have made them. That covers:

- Hotline, web, UDC and court intake.
- The officer's triage, accepted or overridden with a reason.
- Panel lawyers and their court reports, two of them late.
- A referral sent back twice.
- Mediation with two no-shows.
- Five closed cases.

Each step runs on the app's clock set back to when it happened (`clock_set_to` in
`app/database.py`), so the timelines, alerts, court dates and audit ledger read as months of
work. Nothing is sent and no model is asked. The court's application is checked with the NID
registry, and is left out without one. The script is safe to re-run, and refuses in
production without `--force`.

## Mediation notices and Union Digital Centres

When the officer schedules a mediation session (`POST /mediation/sessions`), each party gets
an SMS notice, through `safe_contact` like every other message:

> Notice of a mediation meeting on case APP-2026-004. When: Tuesday 29 September 2026,
> 2:30 pm. Where: District Legal Aid Office, Rangpur (District Judge Court building). Notice
> number: 1234-5678. Please bring your NID. For questions call 16430 and say the notice
> number. - District Legal Aid Office, Rangpur

The Bangla notice gives the date in Bangla. A restricted or watched phone gets only "Your
appointment: {date}. Your number: {code}. Call {helpline} and say the number for details."
Notices are **held**, and nothing is sent, for a do-not-call or sensitive case. A notice
number is eight digits and is never also a tracking number.

The officer records who came (`POST /mediation/sessions/{id}/attendance`): a session with
anyone absent is `missed`. A party who misses `MEDIATION_NO_SHOW_LIMIT` (2) sessions in a
row flags the case `mediationNoShow`, and the Union Digital Centre of their upazila
(`services/udc.py`) is sent the next session's date and place by SMS, naming the person,
their father and village, and asking the UDC to tell them in person. It never carries the
narrative. That happens when the next session is scheduled, or at once if one already is.
For an applicant who is not at the standard safety level, or a sensitive or do-not-call
case, the UDC notice is **held**: telling a UDC where an at-risk applicant lives could
endanger them. An officer can release it with a reason
(`POST /mediation/udc-notices/{id}/release`). A UDC, with `X-Udc-Id`, lists its notices
(`GET /udc/notices`) and reports that it told the person
(`POST /udc/notices/{id}/informed`). `GET /mediation/cases/{ref}` returns the sessions,
notices, attendance and UDC notices for the dashboard.

## The AI helpline

The number in every SMS reaches `agents/helpline.py`, over the phone
(`/telephony/voice?line=helpline`) or `/helpline/conversations`. A hotline caller who
asks about a case they filed is handed to it too, and is asked for the tracking number
first (`HelplineConversation.start(..., tracking=True)`). Given a tracking
number, it reads out only the stage the case has reached, the next mediation date and
the officer's decision on how it will be resolved (`services/case_status.py`). Anyone
could say a number, so it gives no names, narrative or contact details. It explains
what the respondent's SMS means, and answers questions about the office, documents,
mediation, fees and applying from fixed facts. The model, when configured, answers other
questions using the same facts, and rules take over on any failure.

A caller who says a mediation notice's number (tried after tracking numbers) hears what
the notice means: which case the meeting is about, that they are invited as the applicant
or as the other party, the date, time and place, that mediation is free and voluntary, to
bring their NID and the notice number, to call the office if they cannot come, and that
after repeated absences their Union Digital Centre may contact them. The notice is
remembered for the rest of the call, so "when?", "where?", "what should I bring?" and "what
if I can't come?" are answered from it. A caller who asks about a mediation notice without
the number is asked for it. `GET /helpline/notice/{code}` gives the same facts.

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
  confirms or changes (with a reason); the model may choose between advice and mediation
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

## AI agents: Claude or OpenAI

The agents are LangGraph graphs that work without any model. `LLM_PROVIDER` picks the
model they consult:

- `anthropic` (the default): Claude (`LLM_MODEL`, default `claude-opus-5`) when
  `ANTHROPIC_API_KEY` is set.
- `openai`: `OPENAI_MODEL` (default `gpt-6-luna`) when `OPENAI_API_KEY` is set.

The model is consulted where rules are weak:

- **T8:** narratives the keyword rules cannot categorize confidently (priority stays
  rule-based).
- **T5:** every caller turn, alongside the rules, for free-form speech (validated
  formats such as phone numbers still come from rules). On the phone this adds the
  model's response time to each reply.
- **T6:** reading scans and PDFs.
- **T7:** drafting. A draft that drops a term, a party or the statutory reference fails
  review and is replaced by the template.

Requests use structured outputs. Claude requests add server-side refusal fallback
(`fallbacks: "default"`); OpenAI requests go through the Responses API with
`store=False`, so applications are not kept by OpenAI, and the agents' image and PDF
blocks are converted to its input parts. Any failure (network, rate limit, refusal,
invalid output) falls back to rules.

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
2. Set `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` for a voice that speaks Bangla
   natively. `ELEVENLABS_MODEL_ID` must speak Bangla too. The default, `eleven_v3`,
   does. `eleven_flash_v2_5` and the turbo models do not, and read Bangla with a Hindi
   accent. `GET https://api.elevenlabs.io/v1/models` lists each model's languages.
   Replies stream over HTTP, since the WebSocket endpoint rejects the Bangla models, in
   the call's language (`language_code`). `eleven_v3` usually starts within about a
   second but sometimes stalls, so a reply with no audio after
   `ELEVENLABS_FIRST_AUDIO_TIMEOUT_S` (2.5 s) is requested once more. `eleven_v3`
   streams in bursts, and Twilio plays audio as it arrives, so the first
   `VOICE_START_BUFFER_S` (0.6 s) of each reply is held back and sent at once: without
   it, half of all replies had audible gaps; with it, none (about 0.4 s later start).
   `eleven_v3` speaks slowly and ignores ElevenLabs' `speed` setting, so the server
   speeds the audio up itself, `VOICE_SPEED` times (default 1.2) at the same pitch
   (`services/audio.py`, WSOLA), once a second of audio is queued: replies are about
   12% shorter. `eleven_v3_conversational` also speaks Bangla and starts about 0.6 s
   sooner; listen to it before switching `ELEVENLABS_MODEL_ID`.

   At startup the server checks, without spending credit, that ElevenLabs accepts the
   key, the voice and the model, and that the model speaks Bangla. `GET /health` reports
   it as `voice` (`ok`, `off`, `error: <what to fix>` or `unchecked: <why>`), and
   `start.sh` prints it. With a voice that is definitely broken, calls are answered with
   Twilio's own spoken "cannot take applications by phone" message rather than silence.
   A reply that cannot be spoken during a call is logged as "The line could not speak
   on call ..." with the reason.
3. Set `TWILIO_AUTH_TOKEN`. Signature checks are always on when
   `ENVIRONMENT=production`.
4. Set `OPENAI_API_KEY` for speech-to-text. Without it, callers hear a short message
   (call 999 if in danger; apply at a UDC) and the call ends.

### Speech-to-text

Each call opens one OpenAI Realtime transcription session with `gpt-live-transcribe`
(`services/speech_to_text.py`), expecting Bangla and English (`bn`, `en`) on the Bangla
line. The model accepts 24 kHz PCM and has no voice detection, so the service
(`services/audio.py`) decodes Twilio's μ-law, upsamples it, and marks the caller's
turns itself:

- A turn starts after 200 ms of speech. The line stops talking at once (barge-in),
  including audio already sent to Twilio but not yet played, and the turn is sent with
  half a second of pre-roll.
- A turn ends after `STT_END_OF_TURN_MS` (700 ms) of quiet, or
  `STT_STORY_END_OF_TURN_MS` (1200 ms) while an intake caller is still saying what
  happened. It is committed, and its transcript becomes the agent's next input. Only turns are sent, never the silence
  (or our own reply echoing) between them.
- Speech means three times the line's learned noise floor and at least
  `STT_MIN_SPEECH_RMS`. Raise it if line noise interrupts the replies; lower it if
  quiet callers are missed.
- `OPENAI_STT_DELAY` trades earlier text for accuracy (`minimal` … `xhigh`).

A session lost for a passing reason (the service busy, the socket dropped) is opened
again, up to three times per outage (after 0.3, 1 and 2 s). If a turn the caller had
spoken went with it, the line says "দুঃখিত, শেষ কথাটা শুনতে পাইনি। আরেকবার বলবেন?" once
they finish, and the call goes on. If the session is rejected for a setting (key, model
or language), or cannot be opened again, the caller hears that we cannot hear them and
to call again (999 in danger), and the call ends as a cut call: what they said is filed.
The reason is logged. Transcripts are
never logged, except at `LOG_LEVEL=DEBUG`, which is for local testing only.

### Test a call without a phone

`scripts/simulate_call.py` plays Twilio's part: it streams recorded caller turns in
real time, plays the line's replies, and saves the call as a stereo WAV (left: caller,
right: the line).

```bash
# each turn: 8 kHz mono 16-bit WAV
ffmpeg -i answer1.m4a -ar 8000 -ac 1 -c:a pcm_s16le turn1.wav

# the server, with speech-to-text and the debug log (keep SMS a dry run)
LOG_LEVEL=DEBUG SMS_DRY_RUN=true .venv/bin/uvicorn app.main:app --port 8000

.venv/bin/python -m scripts.simulate_call turn1.wav turn2.wav --lang bn
.venv/bin/python -m scripts.simulate_call q1.wav --line helpline --lang en
```

Each turn plays once the previous reply has finished; the server log shows what was
heard and what was replied. `GET /health` shows whether speech-to-text and the voice are
on. An intake
call that reaches the problem files a real application and its SMS notices.

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
- The UDC entrepreneurs' real numbers in `services/udc.py` (the ones there are placeholders)
- `OPENAI_API_KEY` (speech-to-text for both phone lines), and `LLM_PROVIDER` with its key
  if the agents should use a model

## Known limitations

- **Auth:** a shared bearer token plus a header naming who is acting (`X-Officer-Id`,
  `X-Lawyer-Id`, `X-Court-Staff-Id`, `X-Prison-Staff-Id`, `X-Udc-Id`). The server scopes
  every court, jail, lawyer and UDC request to that ID's own records, but it cannot yet tell
  that the ID belongs to the person using it: per-user sign-in (passwords or single sign-on,
  and server-issued sessions) is still to do, and is needed before real court and jail
  records are entered.
- **Rosters:** courts, jails, their staff, panel lawyers and UDCs are lists in `services/`;
  adding one needs a deploy. There is one UDC per upazila for now; real deployments have one
  per union.
- **e-KYC** matches the NID, date of birth and name against the registry; it is not a
  biometric check. The person's photo and fingerprint are not compared.
- **Schema:** tables are created at startup; add Alembic before the first production
  migration.
- **T5 state:** conversation state lives in process memory. Run a single worker, or
  switch to a shared LangGraph checkpointer (Postgres or Redis).
- **T11 identity:** a signature proves the signer holds the key, not who they are.
  Binding keys to parties (for example, enrolment at a UDC) is still to do.
- **Telephony:** live transfer to an officer during an emergency is not implemented.
- **Speech-to-text:** Bangla accuracy of `gpt-live-transcribe` on telephone audio is
  not yet measured; test with real callers before relying on it. Voice detection is by
  loudness, so a loud line, or a phone without echo cancellation, can interrupt
  replies (tune `STT_MIN_SPEECH_RMS`). A turn that fails to transcribe is skipped
  silently, and the caller has to repeat it.
- **ADN SMS:** the request fields follow ADN's secure send-SMS API. Confirm them
  against your ADN account's documentation before going live.
- **Keyword lists:** T6 checklists and T8 terms are a reviewed starting point, not
  legal advice. Have them checked by the legal aid office. The hostage terms are
  person-specific on purpose ("আটকে রেখেছে" alone also means withheld wages), and a
  past event can still trip them: an officer lifts do-not-call after checking.
- **Identity by SIM:** confirming a caller through the SIM they call from relies on
  caller ID, which can be spoofed, and on the name they give. It is only a fallback
  for a caller who cannot answer the security questions, and the dashboard says when
  it was used.
- **NID registry:** `nid-server` holds fictional records. A real Election Commission
  integration needs its own agreement, client and data-protection review.
- **Helpline tracking** is by the eight-digit number alone, with no rate limit yet;
  it reveals only the stage. A mediation notice number reveals only what its SMS said.
  Add rate limiting before a public web tracker.

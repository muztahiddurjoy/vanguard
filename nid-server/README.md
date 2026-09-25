# NID Registry

A stand-in for the Election Commission's National ID (NID) verification service,
holding **fictional** citizen records. The DLAS backend (`../server`) calls it over
HTTP to verify that a caller is who they say they are, to find their registered
relatives (when someone applies for their father, mother, brother or sister), and to
find the SIMs registered under an NID (so the person a case is filed against can be
sent an SMS).

FastAPI · pydantic · rapidfuzz · read-only, in-memory data

> [!WARNING]
> **The people are fictional, but the phone numbers are well-formed Bangladeshi mobile
> numbers and may belong to real subscribers.** Keep the main server's SMS in dry run
> (`SMS_DRY_RUN=true`, the default) or limit live sends with its `SMS_ALLOWLIST` whenever
> it is connected to this registry. Never point a live SMS gateway at these numbers.

## Quick start

```bash
cd nid-server
uv venv --python 3.12 .venv          # or: python3.12 -m venv .venv
uv pip install -r requirements-dev.txt --python .venv/bin/python
cp .env.example .env                 # optional in development
.venv/bin/uvicorn app.main:app --port 8100 --reload
```

Open <http://localhost:8100/docs> for the interactive API. With no `NID_API_KEY`
set (development) the `/v1` routes are open.

| Command | What it does |
| --- | --- |
| `.venv/bin/pytest` | Tests (API, matching, registry integrity checks) |
| `.venv/bin/ruff check . && .venv/bin/ruff format --check .` | Lint and formatting |
| `.venv/bin/mypy` | Type check |
| `docker build -t nid-registry .` | Production image (serves on port 8100) |

If your shell exports a `PYTHONPATH` (ROS, for example), run the tools with
`env -u PYTHONPATH …` so foreign pytest plugins are not loaded.

## Structure

```
app/
  main.py      app factory, routes, API-key check
  config.py    settings (NID_API_KEY, NAME_MATCH_THRESHOLD, DATA_FILE, ENVIRONMENT)
  registry.py  loading, integrity checks, name/district normalisation, matching
  schemas.py   request/response models (also used to parse the data file)
  data/citizens.json
tests/
```

## Endpoints

Every `/v1` route needs `X-API-Key: <NID_API_KEY>` when a key is configured;
otherwise it answers `401 {"detail": "Missing or invalid API key"}`. `/health` is open.

A citizen record:

```json
{
  "nid": "4613802741",
  "name": {"en": "Moyuri Akter", "bn": "ময়ূরী আক্তার"},
  "father": {"name": {"en": "Abdul Hamid", "bn": "আব্দুল হামিদ"}, "nid": "19668517341000562"},
  "mother": {"name": {"en": "Nurjahan Begum", "bn": "নূরজাহান বেগম"}, "nid": "7302619845"},
  "spouse": {"name": {"en": "Jalal Uddin", "bn": "জালাল উদ্দিন"}, "nid": "2854106397"},
  "date_of_birth": "1997-02-14",
  "gender": "female",
  "permanent_address": {"village": {"en": "Shyampur", "bn": "শ্যামপুর"},
                        "upazila": {"en": "Pirgachha", "bn": "পীরগাছা"},
                        "district": {"en": "Rangpur", "bn": "রংপুর"}},
  "present_address": {"…": "same shape"},
  "sims": [{"msisdn": "01712345318", "operator": "Grameenphone", "registered_on": "2016-04-12"}]
}
```

A `father`, `mother` or `spouse` with `"nid": null` is a person who is not in this
registry (usually an older generation, or a spouse registered elsewhere).

| Method and path | Returns |
| --- | --- |
| `GET /health` | `{"status": "ok", "citizens": 40}` |
| `GET /v1/citizens/{nid}` | The citizen, or `404 {"detail": "No citizen with that NID"}`. Spaces, dashes and Bangla digits are accepted (`4613-802-741`). |
| `POST /v1/citizens/match` | Candidates that agree with every given detail (below). |
| `GET /v1/citizens/{nid}/family` | `{"father", "mother", "spouse", "siblings", "children"}` as full records, linked by NID. `404` for an unknown NID. |
| `GET /v1/sims/{msisdn}` | `{"msisdn", "nid", "operator", "registered_on"}`, or `404 {"detail": "SIM not registered"}`. Accepts `01…`, `+880…`, `880…`, `00880…` and the 10-digit `1…` form. |

### Match

```bash
curl -s localhost:8100/v1/citizens/match -H 'Content-Type: application/json' -d '{
  "name": "Moyuri Akter", "father_name": "Abdul Hamid",
  "permanent_district": "Rangpur", "date_of_birth": "1997-02-14"}'
```

```json
{"matches": [{"citizen": {"nid": "4613802741", "…": "…"},
              "score": 100.0,
              "matched": ["name", "father_name", "date_of_birth", "permanent_district"]}],
 "unique": true}
```

Request fields: `name` (required, 1–200 characters), `father_name`, `mother_name`,
`date_of_birth` (`YYYY-MM-DD`), `permanent_district`, `district`, `limit` (1–10,
default 5).

### Family and SIMs

```bash
curl -s localhost:8100/v1/citizens/4287659013/family   # Jamal Hossain
# father: Md. Abdul Karim, mother: Rahima Khatun, siblings: Rafiqul Islam, Shirin Akter

curl -s localhost:8100/v1/sims/+8801811223344
# {"msisdn": "01811223344", "nid": "5830192746", "operator": "Robi", "registered_on": "2016-03-30"}
```

Siblings are other citizens who share a registered father or mother; children are
citizens whose father or mother is this NID. Both lists are sorted eldest first.

## Matching rules

Matching confirms an identity the caller already knows; it is not a people search.

- **Name plus at least two details.** A request needs `name` and at least two of
  `father_name`, `mother_name`, `date_of_birth`, `permanent_district`, `district`;
  otherwise `422 {"detail": "Give at least two details besides the name"}`. Blank
  strings do not count.
- **Every given field must match.** A candidate is returned only if all of them agree.
  `matched` lists the fields that were checked.
- **Names** (`name`, `father_name`, `mother_name`) are compared fuzzily. Both sides are
  NFC-normalised, casefolded, stripped of punctuation, and have their honorifics
  removed: `md`, `mohammad`, `muhammad`, `mohammed`, `mohamed`, `mohd`, `mst`,
  `mosammat`, `mosammot`, `most`, `late`, and `মোঃ`, `মো:`, `মো`, `মোহাম্মদ`,
  `মুহাম্মদ`, `মোসাম্মৎ`, `মোছাঃ`, `মোসাঃ`, `মৃত`, `মরহুম`, `মরহুমা`. "Sheikh" is kept
  (it is a family name). The query is scored with rapidfuzz `token_sort_ratio` against
  both the English and the Bangla stored spelling, and the better score counts. It
  matches at `NAME_MATCH_THRESHOLD` (85) or above. So "Mohammad Abdul Karim" matches
  "Md. Abdul Karim", "Rafikul Islam" matches "Rafiqul Islam" and "মৃত আব্দুল কাদের"
  matches "Abdul Kader".
- **Partial names do not match.** "Shirin" scores well below 85 against "Shirin
  Sultana". Send the full name as the caller gives it.
- **Date of birth** must be exactly equal.
- **Districts**: `permanent_district` is checked against the permanent address only;
  `district` against the permanent *or* present address. The comparison is
  case-insensitive in English or Bangla, ignores a trailing "district"/"জেলা", and
  maps old spellings (Chittagong → Chattogram, Comilla → Cumilla, Barisal → Barishal,
  Jessore → Jashore, Bogra → Bogura, Rongpur → Rangpur, Dacca → Dhaka, and a few more
  in `registry.py`).
- **Score and order.** `score` is the mean of the name-field scores (0–100, one
  decimal). Results are sorted best first and cut to `limit`. `unique` is true only
  when exactly one citizen matched in total, before the cut.

## Notable records

All 40 records are in `app/data/citizens.json`: mostly Rangpur division (Rangpur,
Kurigram, Gaibandha, Nilphamari, Lalmonirhat, Dinajpur), plus a few in Dhaka, Gazipur,
Chattogram, Bogura and Cumilla. Most NIDs are 10-digit smart-card numbers. Five older
people have 17-digit numbers. Case IDs refer to the DLAO dashboard's data.

| Who | NID | Why they exist |
| --- | --- | --- |
| Moyuri Akter | `4613802741` | APP-2026-001 (domestic violence). Shyampur, Pirgachha. SIM `01712345318`. Registered father, mother, brother and husband. |
| Jalal Uddin | `2854106397` | Moyuri's husband and the respondent in her case. Mutual spouse link. Two SIMs. |
| Abdul Hamid, Nurjahan Begum | `19668517341000562`, `7302619845` | Moyuri's parents (Itakumari, Pirgachha). Nurjahan has no SIM. |
| Sohel Rana | `5519273046` | Moyuri's brother. Permanent address Pirgachha, present Savar (Dhaka). Two SIMs. |
| Abdul Malek | `3712580936` | DLAS-2026-045 (land dispute). Ramnathpur, Badarganj. Father "Abdul Kader" is not registered (`nid: null`). Wife Monowara Begum `8206143579`. |
| Abdul Jalil | `6148390275` | Abdul Malek's cousin, the respondent in the land dispute. Not NID-linked to Malek, because their fathers are not registered. |
| Md. Abdul Karim, Rahima Khatun | `19618514962000317`, `2967405183` | The Karim family's parents (Mominpur, Rangpur Sadar). |
| Rafiqul Islam | `5830192746` | Karim son. SIM `01811223344`. Lives in Mirpur, Dhaka. Used to test filing on behalf of a parent or sibling. |
| Shirin Akter, Jamal Hossain | `9105374628`, `4287659013` | The other Karim children. |
| Rahima Begum | `6390284417` | APP-2026-018 (maintenance). Balarhat, Mithapukur. Near-duplicate of Rohima. Owns the household phone `01713554482`. |
| Rohima Begum | `8524179052` | APP-2026-023 (dowry). Same village, different father and date of birth. No SIM of her own: she called from Rahima's phone, so a SIM lookup of that number returns Rahima. |
| Abdur Rashid | `1478205369` | Rahima's husband and the respondent in the maintenance dispute. Now lives in Gazipur. |
| Abdul Karim | `3065817294` | Rohima's husband and Abdur Rashid's brother (both sons of Abdul Jabbar `19568515817000904`). His name normalises to the same as "Md. Abdul Karim", so name alone cannot tell them apart. |
| Nabila Rahman | `7741038265` | APP-2026-012. Permanent address Dinajpur. Present address Tepamadhupur, Kaunia (the dashboard's location). |
| Jahanara Parvin | `2396153380` | APP-2026-027. Divorced (`spouse: null`). Her former husband Mostafizur Rahman `9573026418` is registered separately. |
| Kamal Hossain | `5068247712` | DLAS-2026-039 (wages). One letter away from Jamal Hossain, and both are in Rangpur, so a date of birth or parent is needed to separate them. |
| Mozammel Haque Sarkar | `4829516037` | Brick-kiln owner in Gobindaganj, Gaibandha. Employer and respondent in Kamal's wage case. Three SIMs. |
| Shirin Sultana | `1682945528` | APP-2026-031 (custody). Shyampur, Badarganj. |
| Nurul Amin | `6703958214` | Neighbour and respondent in a land dispute with Mofiz Uddin `8347261590` (Chakirpashar, Rajarhat, Kurigram). |
| Anwar Hossain | `7025846193` | Permanent address Kurigram, present Chattogram: tests `district` against the present address and the Chittagong alias. His mother Kulsum Bibi `19524911877000215` is elderly and has no SIM. |
| Babul Mia | `8016392475` | Moved from Fulchhari, Gaibandha to Mirpur, Dhaka. His mother Hasina Begum `19553219113000648` has no SIM. |
| Farida Yasmin, Delwar Hossain | `9637205814`, `7489031526` | Bogura and Cumilla, for the Bogra and Comilla aliases. |
| Rokeya Khatun, Mofiz Uddin, Sultana Razia, Harun Mia, Parul Begum | — | Applicants from the dashboard's closed cases. |

Dates of birth match the ages shown on the dashboard as of September 2026.
Operators follow the number prefixes: Grameenphone 017/013, Robi 018, Airtel 016,
Banglalink 019/014, Teletalk 015.

## Data file and integrity checks

The registry is loaded once, at startup, and never written. The service refuses to
start if the file breaks any of these rules:

- Every record parses (unknown keys are rejected, dates are `YYYY-MM-DD`, gender is
  `male` or `female`, NIDs are 10, 13 or 17 digits).
- NIDs are unique, and every SIM number is unique across all citizens and matches
  `^01[3-9]\d{8}$`.
- Every non-null `father`/`mother`/`spouse` NID refers to a record in the file, and the
  name given for them matches that record exactly. Fathers are male and mothers are
  female.
- Spouse links are mutual.

Point `DATA_FILE` at another file to use different data. The same checks apply.

## Configuration

See `.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NID_API_KEY` | empty | Key expected in `X-API-Key`. Empty disables the check. |
| `ENVIRONMENT` | `development` | With `production`, the service refuses to start without `NID_API_KEY`. |
| `NAME_MATCH_THRESHOLD` | `85` | Minimum fuzzy name score, 0–100. |
| `DATA_FILE` | bundled `app/data/citizens.json` | Citizens file to load. |

## Known limitations

- **Not the Election Commission's API.** The request and response shapes are this
  project's own contract, not the EC Partner Service's. Swapping in the real service
  needs an adapter in the main server.
- **One shared key.** There are no per-client keys, rate limits or audit log of
  lookups. The real service would need all three, because each lookup reveals
  personal data.
- **Two district fields.** `permanent_district` and `district` count as two separate
  details, so a name with the same district in both fields passes the two-detail rule.
  The main server should send a date of birth or a parent's name when it has one.

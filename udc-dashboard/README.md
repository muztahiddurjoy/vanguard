# Union Digital Centre Dashboard — Digital Legal Aid System

The dashboard for **Union Digital Centre (UDC) entrepreneurs**: the people who run the district's
union-level digital centres. They file legal aid applications **on behalf of their neighbours** —
someone who cannot read the forms, has no smartphone, or shares one phone with the household — and
they pass on mediation dates in person when the office's SMS is not getting through.

This is the channel that reaches the people the others cannot. A court can only help someone
already before it; the hotline needs a phone the caller can speak on privately; the citizen's
Android app needs a smartphone and the confidence to use it. A centre needs none of that: the
applicant walks in, the entrepreneur does the typing, and they leave with a tracking number.

What a centre files goes to the District Legal Aid Office like any other application: triaged,
checked for duplicates, and audited ([`../dlao-dashboard`](../dlao-dashboard/README.md)), and a
panel lawyer takes it from there ([`../lawyer-dashboard`](../lawyer-dashboard/README.md)).

Connected to the backend (`../server`), it keeps the centre's records there. Without a backend it
runs on built-in sample records — three applications at different stages and two mediation
notices — kept in memory until the page is reloaded, so it can be shown and tried with nothing
else running.

It is built for the centre's desk PC or a tablet: the sidebar layout of the other dashboards,
which becomes a sheet on a phone, and the whole UI in **English and বাংলা** (the same toggle and
stored preference; Bangla uses the **Anek Bangla** typeface). Anything the applicant themselves
must understand — the tracking number, what to do next — is written to be read out to them.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, React Router, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons, like the other dashboards.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5177
```

Sign in with one of the **demo centres**: Rehana Parvin (`UDC-MTP`, Latibpur Union Digital Centre,
Mithapukur) or Md. Anisur Rahman (`UDC-PGC`, Tambulpur Union Digital Centre, Pirgachha). Any
centre ID on the district's roster and a password of 4+ characters works.

To try e-KYC, file for Rahima Begum (NID `6390284417`, date of birth 11 February 1992). The other
sample NID records are in `src/data/registry.ts`.

### Live records from the backend

```bash
cp .env.example .env.local   # then set VITE_API_URL=http://localhost:8000
npm run dev
```

The backend's `CORS_ORIGINS` must include `http://localhost:5177`. Sign-in checks the centre's ID
with `GET /udc/me`; every request names the centre in `X-Udc-Id` (and sends `VITE_API_TOKEN` as a
bearer token when set). The server shows a centre only its own applications and notices: anything
else is "not found".

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Vite dev server on port 5177               |
| `npm run build`     | Type-check (`tsc -b`) and production build |
| `npm run preview`   | Serve the production build (port 4177)     |
| `npm test`          | Unit + integration tests (Vitest, jsdom)   |
| `npm run lint`      | ESLint (incl. React Compiler rules)        |
| `npm run typecheck` | TypeScript only                            |

## Screens

| Screen                                 | What it is for                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in**                            | Centre ID + password, the two demo centres, keep me signed in on this computer                                                                                                                                                                                                                        |
| **Today** (`/`)                        | The mediation dates still to pass on (first: those have a date coming), the applications only the centre can finish — no identity check, no signature, no papers — and what was filed recently                                                                                                        |
| **File an application** (`/applications/new`) | Five steps: identity (e-KYC), the applicant and what they need, **the papers they brought**, the signature, then read it back and file. It ends on the tracking number in large digits, with what to say to the applicant before they leave, and a **Print the slip** button.                    |
| **Applications** (`/applications`)     | Everything the centre has filed: applicant, help needed, when, stage, lawyer, how many papers, identity checked; filtered by stage                                                                                                                                                                    |
| **Application** (`/applications/:ref`) | The tracking number and whether it also reached the applicant by SMS; the stage, lawyer and next hearing; why the centre filed; the identity (**Check identity now**) and the signature (**Take their signature**, once checked); and **the papers**, with **Add a paper** and **Open**                |
| **Mediation dates** (`/notices`)       | Each person the office wants told: who they are, their father and village, the date, and where. **I told them**, with a note for the office. Those still to tell come before those already told.                                                                                                      |

## The papers someone brought

A legal aid application is only as good as the papers behind it: a kabinnama for a maintenance
claim, a porcha for a land dispute, a GD copy for a threat. The applicant is holding those papers
at the counter, and the centre has the scanner, so this is where they should go in.

- **Chosen during filing, sent after.** The papers step comes before the application has a number,
  so files wait in the browser and are uploaded once it has one. The application is filed either
  way: a file that fails to upload is named on the last screen and can be added from the
  application page.
- **Named from the file name where that is fair.** `kabinnama.pdf` is offered as a kabinnama,
  `porcha-mofiz.pdf` as a land paper, and the hint says the guess came from the name. `scan0001.pdf`
  guesses nothing and asks. The server reads the file (T6) and may correct the kind afterwards.
- **Checked before sending.** PDF, JPEG, PNG or text, up to 10 MB, not empty — the same rules as
  the server, applied here first so a slow connection is not wasted on a file that will be refused.
- **Added later too.** People come back a week later with the paper they could not find, so the
  application page has the same form.
- **Only ever added.** Nothing here deletes or replaces a file: the ledger holds a hash of what
  arrived, and a correction is another upload.
- **Opened, not linked.** A file is fetched with the centre's identity header and shown from a
  blob URL, because a plain link could not prove who was asking.

## The rules

The same rules as the backend (`server/app/routers/udc.py` and `services/institution.py`),
mirrored by the sample records in `src/data/sample-backend.ts`:

- **e-KYC before a signature.** A signature is taken only once the NID registry has confirmed who
  the person is (NID, date of birth and, if given, name). A check that does not match never says
  which detail was wrong; after two misses, or while the registry cannot be reached, the centre can
  file without e-KYC and verify and sign later from the application page. A verified check is used
  once, by the centre that made it, within two hours.
- **The registry's details win.** With a verified identity, the applicant's name, father, age and
  address come from the registry, not from what was typed. Their **phone number and why the centre
  is filing** are the centre's own observations, so they are asked either way — the registry holds
  no mobile number, and it does not know who can read.
- **A phone decides how they hear.** With a number, the tracking number goes to the applicant by
  SMS as well. Without one, the server marks the notice _handed over_ and the screen tells the
  entrepreneur that this slip is all the applicant has.
- **One application per wizard.** Each wizard makes one `client_ref`; a double click or a retry
  after a lost answer files the same application, and does not send a second SMS.
- **A centre files for a neighbour, not about a record.** It cannot name a court case or a prisoner,
  and cannot mark anyone as in custody: someone in custody applies through the court or the jail
  holding them, which is what the court and jail dashboards are for.
- **Its own records only.** Another centre's application, or a notice the officer is holding back,
  is "not found" — so its existence is not confirmed either.

## Safety and privacy

No screen shows more of an NID than its last four digits (`•••• 4417`). A mediation notice says who
to tell, where they live, and the date and place of the session — never what the dispute is about,
because a neighbour passing on a date has no business knowing it, and the office's own SMS says no
more either. A sensitive case's file names are withheld from everyone but the authorized officer,
and this dashboard shows the kind of paper instead.

## Project structure

```
src/
  main.tsx  routes.tsx
  pages/          sign in, today, applications, application, file an application,
                  mediation dates, not found
  api/            backend client (X-Udc-Id, JSON and multipart), the centre's endpoints
  auth/           sign-in (session storage by default) + route guard
  state/          which backend the pages use (server or sample records)
  data/           types, the backend interface, the roster of centres, the panel,
                  sample NID records, the demo records and the sample backend
  i18n/           en/bn dictionaries, provider, locale formatters
  lib/            application and e-KYC helpers, phone numbers, evidence rules and
                  kind guessing, signatures, dates, NIDs
  hooks/          data loading with retry, debounce, page title
  components/
    ui/           shadcn/ui components (copied from the other dashboards)
    layout/       sidebar, header, account menu, page header, loading and retry
    applications/ e-KYC form, applicant step, papers step, evidence panel,
                  kind select, signature pad and upload, tracking number, badges
    notices/      one mediation date to pass on
  test/           integration tests (sample and live) and the render helper
```

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bangla is added too, and a test fails if the Bangla is just a copy of the English.
Names from the records have English and Bangla forms (`name` / `nameBn`), read with `pickName()`
from `useI18n()`. What the entrepreneur writes (the account of what happened, a note on a notice)
is kept in their own words and reads the same in both languages.

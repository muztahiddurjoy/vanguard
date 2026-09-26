# Court Dashboard — Digital Legal Aid System

The dashboard for **court staff**: the bench assistants and sheristadars of the district's
courts. They keep their court's register and daily cause list here, and send the District Legal
Aid Office (DLAO) an application for anyone before the court who needs a lawyer, so nobody at
the office types it again. Before an application goes, staff check the applicant's identity
against the NID registry (e-KYC); with a verified identity, the applicant signs on screen or
staff upload a scanned signature or thumbprint. The applicant leaves with a tracking number to
follow the case on the helpline.

What a court saves reaches the others at once: the jails see who to produce from the cause
list, the DLAO dashboard ([`../dlao-dashboard`](../dlao-dashboard/README.md)) gets the
application with its identity check and signature, and panel lawyers see the court record of
the cases they hold ([`../lawyer-dashboard`](../lawyer-dashboard/README.md)).

Connected to the backend (`../server`), it keeps the court's records there. Without a backend
it runs on the district's shared demo records (the same cases, prisoners and NID records the
server's `scripts/seed_records.py` loads), kept in memory until the page is reloaded.

It is built for a desk PC: the DLAO dashboard's sidebar layout, which becomes a sheet on a
phone, and the whole UI in **English and বাংলা** (the same toggle and stored preference as the
other dashboards; Bangla uses the **Anek Bangla** typeface).

Built with React 19, TypeScript, Vite, Tailwind CSS v4, React Router, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons, like the other dashboards.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5175
```

Sign in with one of the **demo accounts**: Md. Abdul Hakim (`CS-11`, bench assistant,
Chief Judicial Magistrate Court) or Farzana Yeasmin (`CS-14`, sheristadar, Nari o Shishu
Nirjatan Daman Tribunal-1). Any court staff ID on the roster and a password of 4+ characters
works.

To try e-KYC, apply for Jalal Uddin from case G.R. 455/2026 (NID `2854106397`, date of birth
5 June 1990). The other sample NID records are in `src/data/registry.ts`.

### Live records from the backend

```bash
cp .env.example .env.local   # then set VITE_API_URL=http://localhost:8000
npm run dev
```

The backend's `CORS_ORIGINS` must include `http://localhost:5175`. Sign-in checks the staff ID
with `GET /court/me`; every request names the member of staff in `X-Court-Staff-Id` (and sends
`VITE_API_TOKEN` as a bearer token when set). The server shows a court only its own register,
cause lists and applications: anything else is "not found".

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Vite dev server on port 5175               |
| `npm run build`     | Type-check (`tsc -b`) and production build |
| `npm run preview`   | Serve the production build (port 4175)     |
| `npm test`          | Unit + integration tests (Vitest, jsdom)   |
| `npm run lint`      | ESLint (incl. React Compiler rules)        |
| `npm run typecheck` | TypeScript only                            |

## Screens

| Screen                                                 | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in**                                            | Court staff ID + password, the two demo accounts, keep me signed in                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Today** (`/`)                                        | The court, today's cause list (how many cases, the first few) and the next listed day, the applications still waiting for e-KYC or a signature, and where recent applications stand. Quick actions: New legal aid application, Register a case, Today's cause list.                                                                                                                                                                                                    |
| **Cause list** (`/cause-lists/:date?`)                 | A day's list: serial, time, case number (linked once registered), the case, purpose and _In custody_, with the judge and who saved it. Previous and next day, a date picker and Today. **Edit** rows and the judge, or **Paste from a spreadsheet** (tab- or comma-separated serial, time, case number, purpose; header optional; each line that cannot be used is named). Saving checks serials and required fields; an empty list is withdrawn after a confirmation. |
| **Cases** (`/cases`)                                   | The register, searched by number, title or party, and filtered by status                                                                                                                                                                                                                                                                                                                                                                                               |
| **Register a case** (`/cases/new`)                     | Number, type, title, sections, filing date, the parties (role, name, Bangla name, father, age, optional NID) and **restricted**                                                                                                                                                                                                                                                                                                                                        |
| **Case** (`/cases/:id`)                                | The parties (each with **Apply for legal aid**), the next date, the proceedings (**Record proceedings**), the lawyers now and before (**Add lawyer**, **End appearance**), upcoming cause-list slots, who is held on the case and in which jail, and its legal aid applications                                                                                                                                                                                        |
| **Legal aid** (`/applications`)                        | The court's applications: applicant, help needed, when, stage, lawyer, identity verified, signed; filtered by stage                                                                                                                                                                                                                                                                                                                                                    |
| **Application** (`/applications/:ref`)                 | The tracking number, large, to give the applicant; the stage, lawyer, next hearing and court case; the identity (**Verify now**) and the signature (**Add signature**, once verified)                                                                                                                                                                                                                                                                                  |
| **New application** (`/applications/new?case=&party=`) | Four steps: identity (e-KYC), the application, the signature, review and submit. Opened from a party, it starts with their name, the case and custody filled in.                                                                                                                                                                                                                                                                                                       |

## The rules

The same rules as the backend (`server/app/routers/court.py`), mirrored by the sample records
in `src/data/sample-backend.ts`:

- **e-KYC before a signature.** An applicant's signature is taken only once the NID registry has
  confirmed who they are (NID, date of birth and, if given, name). A check that does not match
  never says which detail was wrong; after two misses, or while the registry cannot be reached,
  staff can send the application without e-KYC, and verify and add the signature later from the
  application page. A verified check is used once, by the court that made it, within two hours.
- **The registry's details win.** With a verified identity, the applicant's name, father,
  age and address come from the registry, not from what was typed.
- **One application per wizard.** Each wizard makes one `client_ref`; a double click or a retry
  after a lost answer returns the same application.
- **Restricted records.** A juvenile's case or a sealed record is marked _restricted_: it is
  never shown as anyone's previous record to the legal aid office or a lawyer.
- **Cause lists.** Serials are 1–999 and unique on a day; a case number that is not registered
  yet is allowed and links to the case once the court registers it (numbers match however they
  were typed: "G.R. 455/2026", "gr 455 / 2026").
- **Proceedings.** A hearing cannot be after today, the next date comes after the hearing, and a
  judgment has no next date and disposes of the case.

## Safety and privacy

No screen shows more of an NID than its last four digits (`•••• 6397`). An NID typed for a party
is kept by the server only to find the same person's other cases. Applications from a court
send no SMS (the applicant may have no phone); staff hand over the tracking number instead, and
the legal aid office deals with applicants in custody first.

## Project structure

```
src/
  main.tsx  routes.tsx
  pages/          sign in, today, cause list, cases, register a case, case,
                  legal aid, application, new application, not found
  api/            backend client (X-Court-Staff-Id), the court's endpoints
  auth/           sign-in (session storage) + route guard
  state/          which backend the pages use (server or sample records)
  data/           types, the backend interface, rosters (courts, jails, panel),
                  sample NID records, the demo records and the sample backend
  i18n/           en/bn dictionaries, provider, locale formatters
  lib/            dates, case numbers, NIDs, cause-list paste and checks, e-KYC and
                  application helpers, signatures
  hooks/          data loading with retry, debounce, page title
  components/
    ui/           shadcn/ui components (copied from the other dashboards)
    layout/       sidebar, header, account menu, page header, loading and retry
    cause-list/   the editor, paste from a spreadsheet, custody badge
    cases/        record proceedings, add lawyer / end appearance, badges
    applications/ e-KYC form, signature pad and upload, application step,
                  tracking number, stage badges
  test/           integration tests (sample and live) and the render helper
```

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bangla is added too, and a test fails if the Bangla is just a copy of the English.
Names from the records have English and Bangla forms (`name` / `nameBn`), read with `pickName()`
from `useI18n()`. What staff write (proceedings, purposes, the application) is kept in their own
words and reads the same in both languages.

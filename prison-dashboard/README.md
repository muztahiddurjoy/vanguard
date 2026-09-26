# Jail Dashboard — Digital Legal Aid System

The dashboard for **jail staff**: the legal aid desk and the deputy jailers of the district's
jails. They keep the jail's prisoner records, each linked to the court cases the prisoner is held
on; see who has to be produced in court and when, from the courts' own cause lists; and send
legal aid applications for prisoners straight to the District Legal Aid Office, so nobody there
types them again. The application arrives in the DLAO dashboard's queue
([`../dlao-dashboard`](../dlao-dashboard/README.md)) marked _in custody_, and the prisoner or
their family follow it on the helpline (16430) with the tracking number the jail hands them.

Before an application goes, staff can check the prisoner's identity against the national NID
registry (**e-KYC**). Only a verified identity can carry the prisoner's **signature**, drawn on
the screen or uploaded as a scan of a signature or thumbprint.

Connected to the backend (`../server`), it shows the jail's real records and sends its
applications there. Without a backend it runs on built-in sample records (the shared demo
dataset the server's `scripts/seed_records.py` puts in the database), and changes stay on screen
until the page is reloaded.

It is built for a desk PC, with the DLAO dashboard's sidebar layout, and works on a tablet and a
phone too. The whole UI is in **English and বাংলা** (the same toggle and stored preference as the
other dashboards; Bangla uses the **Anek Bangla** typeface). Institutions keep their real names:
Rangpur Central Jail, রংপুর কেন্দ্রীয় কারাগার.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, React Router, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons, like the other dashboards.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5176
```

Sign in with one of the **demo accounts**, both at Rangpur Central Jail: Nasima Khatun (`JS-08`,
Legal Aid Desk Officer) or Md. Golam Rabbani (`JS-03`, Deputy Jailer). `JS-12` (Md. Shafiqul
Alam, Nilphamari District Jail) signs in too and sees only his own jail. Any password of 4+
characters works.

To see e-KYC match, use Jalal Uddin (`RCJ-2026-0412`): NID `2854106397`, born `1990-06-05`.

### Live records from the backend

```bash
cp .env.example .env.local   # then set VITE_API_URL=http://localhost:8000
npm run dev
```

The backend's `CORS_ORIGINS` must include `http://localhost:5176` (the default does). Sign-in
checks the staff ID with `GET /prison/me`; every request names the member of staff in
`X-Prison-Staff-Id` (and sends `Authorization: Bearer <VITE_API_TOKEN>` when set), and the server
shows them only their own jail. The API is under `/prison` (`server/app/routers/prison.py`).

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Vite dev server on port 5176               |
| `npm run build`     | Type-check (`tsc -b`) and production build |
| `npm run preview`   | Serve the production build (port 4176)     |
| `npm test`          | Unit + integration tests (Vitest, jsdom)   |
| `npm run lint`      | ESLint (incl. React Compiler rules)        |
| `npm run typecheck` | TypeScript only                            |

## Screens

| Screen                                                  | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in**                                             | Jail staff ID + password, the demo accounts, keep me signed in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Today** (`/`)                                         | Prisoners to produce in court today and tomorrow (time, court, case, purpose, ward), undertrial prisoners with no legal aid application yet (with **Apply for legal aid**), where the jail's applications stand, and the quick actions: new application, admit a prisoner, court dates                                                                                                                                                                                                                                                                                                               |
| **Prisoners** (`/prisoners`)                            | The register: search by prisoner number, name (English or Bangla) or father's name; show those in custody (undertrial and convicted, the default), one status, or everyone                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Admit a prisoner** (`/prisoners/new`)                 | An optional e-KYC check first (it fills the details from the registry, marked verified), then the prisoner number, admission date, status, ward, name, Bangla name, father's name, gender, age, address, and one row per court case (the court from the district's roster and the case number; at least one for an undertrial prisoner)                                                                                                                                                                                                                                                              |
| **Prisoner** (`/prisoners/:id`)                         | Details (NID as •••• and its last four digits, with whether it is verified), each court case (whether the court has registered it, else _Not yet on the court's register_; type, sections, status, next date and purpose, the cause-list dates to come), legal aid applications with their stage and lawyer, **Apply for legal aid** and **Update** (status with the date released or transferred, ward, court cases)                                                                                                                                                                                |
| **Court dates** (`/court-dates`)                        | The production list for today, tomorrow, or the next 7, 14 (default) or 30 days, by date, then court: serial, time, case, purpose, prisoner number and name, ward. **Print** gives a clean table with the jail's name and the dates, without the menus                                                                                                                                                                                                                                                                                                                                               |
| **Legal aid** (`/applications`)                         | The jail's applications, newest first, with a stage filter: application, prisoner, help needed, sent, stage, lawyer, identity verified, signed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Application** (`/applications/:ref`)                  | The tracking number, large, to hand to the prisoner or their family; the stage and what it means, the panel lawyer (so a legal visit can be arranged), the next hearing, the prisoner and court case; identity (**Verify now** runs e-KYC and records it) and signature (**Add signature**, once verified)                                                                                                                                                                                                                                                                                           |
| **New application** (`/applications/new?prisoner=<id>`) | Four steps. **1. Identity (e-KYC)**: NID, date of birth and name (prefilled from the prisoner) → the registry's record, or _did not match_ (after two misses, _Continue without e-KYC_), or _registry unavailable_ (continue without it). **2. Application**: the prisoner, the applicant (from the prisoner's record, or read-only from the registry once verified), the help needed and why (20+ characters). **3. Signature**: drawn on a pad (mouse, pen or touch) or a scan (PNG/JPEG, up to 2 MB), or _Add it later_. **4. Review and submit**, then the tracking number and what happens next |

## Rules

- **e-KYC before a signature.** A signature is only accepted with a verified identity, in the
  wizard and on the application page; the server refuses one otherwise. e-KYC is per
  application: it is offered every time, even for a prisoner verified at admission. A check can
  be used once, by the jail that made it, within two hours.
- A miss never says which detail was wrong. After two misses, or with the registry out of reach,
  the application can go without e-KYC and be verified later from its page.
- Each application form makes its own `client_ref`, so sending it twice (a retry after a lost
  connection) never makes a second application.
- **What a jail sees**: its own prisoners and its own applications, and of each court case only
  what it needs to produce the prisoner (court, number, type, sections, status, next date, the
  cause list). Another jail's records are "not found". It does not see the case file, the
  proceedings, other parties, or what the DLAO does inside a case beyond its stage, the lawyer
  and the next hearing.
- A case number links to the court's register however it was typed (`G.R. 455/2026`,
  `gr 455 / 2026`), so a case the court registers later appears with its dates by itself.

## Safety

No screen shows a full NID: only •••• and the last four digits, whether the record came from the
registry or the server. The NID typed for e-KYC goes to the server for the check and is not kept
by the dashboard. Nothing sensitive is logged. Every e-KYC check, record change and signature is
audited on the server.

## Project structure

```
src/
  main.tsx  routes.tsx
  pages/          sign in, today, prisoners, admit, prisoner, court dates, applications,
                  application, new application (the wizard), not found
  api/            backend client (X-Prison-Staff-Id), server views -> the dashboard's types
  auth/           sign-in (session storage) + route guard
  state/          which backend the screens talk to: the server, or the sample jail
  data/           types, the jail and court rosters, the sample NID records, court records,
                  prisoners and application, and the in-memory sample backend
  i18n/           en/bn dictionaries, provider, locale formatters
  hooks/          loading with retry, page title, clock, phone breakpoint
  lib/            prisoner search, court-date grouping, case numbers, NID digits, e-KYC state,
                  application form, signature files
  components/
    ui/           shadcn/ui components (copied from the DLAO dashboard)
    layout/       sidebar, header, account menu, page header, loading and retry
    common/       badges, sections, labelled fields
    ekyc/         the e-KYC form and the registry's record
    signature/    the signature pad (canvas, pointer events) and the scan upload
    prisoners/    court case rows, the prisoner's cases, the update dialog
    applications/ the wizard's steps and stepper, tracking number, verify and sign dialogs
  test/           integration tests (sample and live mode) and the render helper
```

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bangla is added too, and a test fails if the Bangla is just a copy of the English.
Office and staff names use `{ en, bn }` fields, read with `pick()` from `useI18n()`; a person's
name shows in Bangla where the record has one. What staff write (the narrative, case numbers,
wards) is kept in their own words.

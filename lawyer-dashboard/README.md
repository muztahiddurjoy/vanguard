# Panel Lawyer Dashboard — Digital Legal Aid System

The dashboard for the district's **panel lawyers**: the private lawyers the District Legal Aid
Office pays to take legal aid cases. A lawyer sees the cases the office gave them and their
hearings, and sends a short report from court after each hearing. The report reaches the
District Legal Aid Officer's dashboard ([`../dlao-dashboard`](../dlao-dashboard/README.md)) at
once, and the applicant hears the next hearing date when they call the AI helpline.

Connected to the backend (`../server`), it shows the lawyer's real cases and posts their updates
there. Without a backend it runs on built-in sample cases (the same cases, lawyers and court
dates as the DLAO dashboard's), and updates stay on screen until the page is reloaded.

It is built for a phone in a court corridor: large targets, a bottom navigation bar on phones,
the update form full screen, and the whole UI in **English and বাংলা** (the same toggle and
stored preference as the DLAO dashboard; Bangla uses the **Anek Bangla** typeface).

Built with React 19, TypeScript, Vite, Tailwind CSS v4, React Router, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons, like the DLAO dashboard.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5174
```

Sign in with one of the **demo accounts**: Adv. Nasrin Jahan (`LAW-12`, up to date) or
Adv. Shahidul Islam (`LAW-07`, reports late). Any panel lawyer ID and a password of 4+
characters works.

### Live cases from the backend

```bash
cp .env.example .env.local   # then set VITE_API_URL=http://localhost:8000
npm run dev
```

The backend's `CORS_ORIGINS` must include `http://localhost:5174` (the default does). Sign-in
checks the lawyer ID with `GET /lawyer/me`; every request names the lawyer in `X-Lawyer-Id`,
and the server shows them only their own open cases. A lawyer gets a case when an officer
assigns it on the DLAO dashboard. `../start.sh` runs everything, both dashboards included.

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Vite dev server on port 5174               |
| `npm run build`     | Type-check (`tsc -b`) and production build |
| `npm run preview`   | Serve the production build                 |
| `npm test`          | Unit + integration tests (Vitest, jsdom)   |
| `npm run lint`      | ESLint (incl. React Compiler rules)        |
| `npm run typecheck` | TypeScript only                            |

## Screens

| Screen                      | What it is for                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in**                 | Panel lawyer ID + password, the two demo accounts, keep me signed in                                                                                                                                                                                                                                                                                                                            |
| **My cases**                | The lawyer's profile (Bar Council enrolment, on the panel since), four numbers (open cases, hearings in the next 30 days, reports sent, reports late), "the office is waiting" when a report is late, search, and one card per case: where it stands in court, the next hearing, when the next report is due, the latest report, **Open case** and **Send an update**. Late reports come first. |
| **Case**                    | Court progress (stage, next hearing, next report), every report sent from court (including a previous lawyer's), the client and how to contact them safely, who the complaint is against, and what happened                                                                                                                                                                                     |
| **Hearings**                | Hearings whose date has passed without a report, then the next 30 days grouped by day                                                                                                                                                                                                                                                                                                           |
| **Send an update** (dialog) | What happened in court (the stage), the court, the date of the hearing, the next date fixed, what happened in the lawyer's words (20+ characters), and the order sheet or certified copy (PDF, JPEG or PNG, up to 10 MB)                                                                                                                                                                        |

## Reporting rules

The same rules as the backend (`server/app/services/court_progress.py`, mirrored in
`src/lib/court.ts`):

- A report is due **every 14 days**, and **within 3 days of each hearing** the court fixed.
- Missing either marks the case _Reports late_ here, and raises the lawyer inactivity alert
  (and, across several cases, the pattern alert) on the DLAO dashboard.
- The next hearing is the last date the court fixed, until a report comes after it. A note
  without a date keeps the earlier one; a judgment ends the dates.
- When the officer sends a reminder, the case says _Reminder from the office_ until the next
  report.

## Safety

A lawyer is held to the same contact rules as the office. For an applicant nobody may call (a
possible hostage, or a call cut during violence) the server sends no phone number and the case
says **Do not call or text your client**. A watched phone shows the safe time, and the **Call**
link appears only inside it. Sensitive cases say so.

## Project structure

```
src/
  main.tsx  routes.tsx
  pages/          sign in, my cases, case, hearings, not found
  api/            backend client (X-Lawyer-Id), server case view -> LawyerCase
  auth/           sign-in (session storage) + route guard
  state/          the lawyer's cases (sample or live) and sending an update
  data/           types, the panel roster and the sample cases
  i18n/           en/bn dictionaries, provider, locale formatters
  lib/            reporting rules, case sorting and search, safe-contact window maths
  components/
    ui/           shadcn/ui components (copied from the DLAO dashboard)
    layout/       header, bottom navigation, account menu, page header
    cases/        case card, badges, update form, court reports, contact rules
  test/           integration tests and the render helper
```

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bangla is added too, and a test fails if the Bangla is just a copy of the English.
Case data uses `{ en, bn }` fields, read with `pick()` from `useI18n()`. What a lawyer writes is
kept in their own words; from the server it reads the same in both languages.

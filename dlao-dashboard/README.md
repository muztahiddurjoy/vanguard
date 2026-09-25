# DLAO Dashboard — Digital Legal Aid System

The **District Legal Aid Officer (DLAO)** dashboard for the Digital Legal Aid System (DLAS).
It runs entirely in the browser: cases, lawyers and hearings are sample data held in React state
(there is no backend yet), so you can work through the whole officer workflow and reset it by
reloading the page.

It is built to be understood by anyone. Every screen opens with a sentence saying what it is for.
Every case says why it needs attention and offers one clear button for the next step. Technical
terms are explained where they appear and in the Help page.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, React Router, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons. The whole UI is available in
**English and বাংলা**; Bangla uses the **Anek Bangla** typeface.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Sign in with **Fill in the demo account** (or any officer ID and a password of 4+ characters).

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                       |
| `npm run build`     | Type-check (`tsc -b`) and production build     |
| `npm run preview`   | Serve the production build                     |
| `npm test`          | Unit + integration tests (Vitest, jsdom)       |
| `npm run lint`      | ESLint (incl. React Compiler rules)            |
| `npm run typecheck` | TypeScript only                                |

The app uses hash URLs (`/#/queue`), so the `dist/` folder works on any static host without
rewrite rules.

## Screens

| Screen | What it is for |
| --- | --- |
| **Sign in** | Officer ID + password, show/hide password, keep me signed in, forgot-password help, one-click demo account |
| **Home** | Greeting, four summary numbers, the three most urgent cases ("Start here"), your lists, upcoming hearings |
| **Work queue** | Every open case that needs you, filtered by _Needs Action Today_, _Pending AI Triage_, _Duplicates for Review_, _Overdue / Alerts_; one button per case |
| **Case** (dialog) | Safety warning, "What to do now", AI triage recommendation, case information and history |
| **Duplicate check** (dialog) | "Is this the same person?" — side-by-side records, 85% fuzzy match, merge blocked, confirm as distinct |
| **All cases** | Register of open and closed cases, with how each closed case ended |
| **Lawyers** | Panel lawyers, their open cases, who has stopped reporting, send a reminder |
| **Hearings** | Court hearings and mediation meetings for the next two weeks, grouped by day |
| **Reports** | Key numbers and three charts, each with a table view |
| **My profile** | Officer details, editable contact details, this session's decisions |
| **Settings** | Language, text size (whole UI scales), notification choices |
| **Help** | Getting started, common questions, what priorities mean, glossary, contacts |
| **Notifications** (bell) | Live list of what needs attention; opens the case |

## Demo walkthrough

1. **Sign in** with the demo account. Switch **EN / বাংলা** at any time — labels, case data,
   digits and dates all change.
2. **Home → Start here:** Moyuri Akter is first. Note the red **Do not call now** line.
3. **Moyuri Akter (APP-2026-001):** press **Review AI suggestion**.
   - The **DO NOT CALL NOW · Safe Contact Window: Tue 14:00–16:00** banner blocks the Call button
     outside the window (it uses the real clock).
   - **AI Triage Recommendation** shows the recommended **HIGH** priority and the warning signs
     (`[✓] Active Violence Detected`, `[✓] Proxy Reported (Access Barrier)`, `[✓] Safe Contact
     Restricted`, …), each with the check that found it.
   - **Override Priority** requires a new priority and a **Justification for Override**
     (20+ characters). Saving updates the queue badge ("Changed by officer") and the history.
4. **Rohima Begum (APP-2026-023):** press **Compare records**. Fuzzy Match Confidence 85%, the
   same name/phone/village highlighted, **Merge Records** blocked (different National IDs),
   **Confirm as Distinct Individuals** resolves it.
5. **Abdul Malek (DLAS-2026-045):** _Lawyer Inactivity Alert_ — remind the lawyer from the case or
   from the **Lawyers** page.
6. **Nabila (APP-2026-012):** _Sensitive_, _Cyber Harassment_, _Jurisdiction Escalation_ — details
   hidden in lists; transfer the case.
7. **Profile** now counts the decisions you just made; **Settings → Text size → Extra large**
   enlarges the whole interface.

## Project structure

```
src/
  main.tsx                    providers + hash router
  routes.tsx                  every screen and its URL
  pages/                      one file per screen
  auth/                       sign-in (session storage) + route guard
  state/                      case reducer (pure, tested) + provider that owns the case dialogs
  preferences/                text size and notification choices
  data/                       types and bilingual sample data (cases, lawyers, hearings, reports)
  i18n/                       en/bn dictionaries, provider, locale formatters, case/activity wording
  lib/                        queue filtering/sorting, safe-contact window maths
  components/
    ui/                       shadcn/ui components (generated, owned by you)
    layout/                   app layout, sidebar, header, page header, menus
    queue/  case/  case-detail/  triage/  duplicate/  home/  hearings/  reports/
  test/                       integration tests and the render helper
```

## Working with shadcn/ui

- Add components with `npx shadcn@latest add <name>`. They land in `src/components/ui`
  (the `@/` alias points at `src/`).
- Theme tokens live in `src/index.css`. Besides the standard shadcn tokens, the palette adds
  `danger`, `warning`, `success` and `info`, each with `-surface` (background) and `-foreground`
  (text) roles; every text/background pair meets WCAG AA (most AAA). Use them as
  `bg-warning-surface text-warning-foreground`.
- Chart colours (`--chart-1…5`) are the validated categorical slots from the dataviz method
  (colour-blind separation checked with its validator). Keep their order.
- Local changes to generated files, which `shadcn add --overwrite` would undo:
  `dialog.tsx` (`closeLabel` prop for translation), `switch.tsx` (rem-based `lg` size),
  `use-mobile.ts` (`useSyncExternalStore`), `scroll-area.tsx` (unused import). `button-link.tsx`
  is ours: a link styled as a button.

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bangla is added too, and a test fails if the Bangla is just a copy of the English.
Keep the style plain: short sentences, everyday words, and explain any term the spec requires.
Case data uses `{ en, bn }` fields, read with `pick()` from `useI18n()`.

## Accessibility notes

- Status is never shown by colour alone: priority, tags and warnings pair an icon with text.
- Skip link, labelled `<nav>`, visible focus rings, page titles per screen, and focus moves to the
  new page on navigation. Result counts are announced (`role="status"`).
- Form errors are linked to their fields and focus moves to the first problem.
- The disabled _Merge Records_ button stays focusable so its reason can be read out.
- Charts: every value is available as text (labels, legend values or a table view); columns
  are keyboard-focusable with their value in the accessible name.
- Text size setting scales the whole UI; `prefers-reduced-motion` is respected.

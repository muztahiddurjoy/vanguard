# DLAO Dashboard — Digital Legal Aid System (prototype)

An interactive, front-end-only prototype of the **District Legal Aid Officer (DLAO)** dashboard
for the Digital Legal Aid System (DLAS) hackathon. There is no backend: every case is hardcoded
dummy data held in React state, so you can click through the full officer workflow and reset it by
reloading the page.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com)
(Base UI primitives, `base-vega` style) and Lucide icons. The whole UI is available in
**English and বাংলা**.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                       |
| `npm run build`     | Type-check (`tsc -b`) and production build     |
| `npm run preview`   | Serve the production build                     |
| `npm test`          | Unit + integration tests (Vitest, jsdom)       |
| `npm run lint`      | ESLint (incl. React Compiler rules)            |
| `npm run typecheck` | TypeScript only                                |

## Demo walkthrough

1. **Language:** use the **EN / বাংলা** toggle in the header. Every label, the case data, digits
   and dates switch, and `<html lang>` updates for screen readers. The choice is remembered.
2. **Unified Operational Queue:** filter by _Needs Action Today_, _Pending AI Triage_,
   _Duplicates for Review_ or _Overdue / Alerts_ (tabs or sidebar), search by name or case ID, or
   filter by priority. Every row has a **Next action** button.
3. **Moyuri Akter (APP-2026-001):** click her name.
   - A red **DO NOT CALL NOW · Safe Contact Window: Tue 14:00–16:00** guardrail is shown, and
     _Call applicant_ is disabled outside the window. This check uses the real clock.
   - The **T8 AI Triage** tab shows the recommended **HIGH** priority and the decomposed urgency
     factors (`[✓] Active violence detected`, `[✓] Proxy reported`, `[✓] Safe contact restricted`,
     …), each with the agent that contributed it.
   - **Override priority** opens a form that requires a new priority and a written justification
     (at least 20 characters). Saving updates the badge in the queue, marks it _Set by officer
     override_, and records the justification in the activity log.
4. **Rohima Begum (APP-2026-023):** press **Review duplicate** to open the **T4** split-screen
   comparison with **Fuzzy Match Confidence: 85%**. Name, phone and village are highlighted as
   matches. _Merge records_ is disabled because the national IDs conflict, and **Confirm as
   distinct individuals** resolves the pair.
5. **Abdul Malek (DLAS-2026-045):** lawyer inactivity alert (2 missed updates). Send the lawyer a
   reminder.
6. **Nabila (APP-2026-012):** sensitive cyber-harassment case. Her summary and phone number are
   hidden in the queue, and the case can be escalated to NLASO for a jurisdiction transfer.

## Project structure

```
src/
  App.tsx                     page composition + dialog state
  data/                       types and bilingual mock cases
  state/cases-reducer.ts      all workflow transitions (pure, unit-tested)
  i18n/                       en/bn dictionaries, provider, locale formatters
  lib/                        queue filtering/sorting, safe-contact window maths
  components/
    ui/                       shadcn/ui components (generated, owned by you)
    layout/                   sidebar, header, language toggle, user menu
    queue/                    operational queue, stats, rows/cards
    case/                     priority/flag badges, safe-contact guardrail
    case-detail/              case dialog, next-step panel, details, activity log
    triage/                   T8 triage panel + priority override form
    duplicate/                T4 duplicate review dialog
```

## Working with shadcn/ui

- Add components with `npx shadcn@latest add <name>`. They are written to `src/components/ui`
  (the `@/` alias points at `src/`).
- Theme tokens live in `src/index.css`. On top of the standard shadcn tokens, the palette adds
  `danger`, `warning`, `success` and `info`, each with `-surface` (background) and `-foreground`
  (text) variants. The text/background pairs meet WCAG AA contrast (most meet AAA). Use them as
  `bg-warning-surface text-warning-foreground`.
- `src/components/ui` has one local change: `DialogContent` accepts a `closeLabel` prop so the
  close button can be translated.

## Adding or changing text

Add the English string to `src/i18n/messages/en.ts`. `bn.ts` is typed against it, so the build
fails until the Bengali translation is added too, and a test fails if the Bengali text is just a
copy of the English. Case data uses `{ en, bn }` fields, read with `pick()` from `useI18n()`.

## Accessibility notes

- Status is never shown by colour alone: priority and flags always pair an icon with text.
- There's a skip link, a labelled `<nav>` landmark, visible focus rings, and filter result counts
  are announced (`role="status"`).
- Form errors are linked to their fields with `aria-describedby`, and focus moves to the first
  invalid field.
- The disabled _Merge records_ button stays focusable so the reason it's disabled can be read out.
- Motion is reduced when `prefers-reduced-motion` is set.

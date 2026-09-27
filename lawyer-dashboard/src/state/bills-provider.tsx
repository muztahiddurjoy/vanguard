import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react"

import {
  fetchBill,
  fetchBillSchedule,
  fetchMyBills,
  postBill,
  postBillSubmit,
  putBillLines,
} from "@/api/bills"
import { apiEnabled } from "@/api/client"
import { useLawyer } from "@/auth/use-auth"
import { SAMPLE_SCHEDULE, sampleBillableFor, sampleBillsFor } from "@/data/sample-bills"
import type { Bill, Billable, BillLine, BillLineDraft, BillSchedule, Lawyer } from "@/data/types"
import { billTotals, headOf, nextBillNumber, toLineDraft } from "@/lib/bills"
import { BillsContext, type BillsSync } from "@/state/bills-context"
import { billsReducer, NO_TOTALS, type BillsState } from "@/state/bills-reducer"

function initialState(live: boolean, lawyerId: string): BillsState {
  if (live) return { bills: [], billable: [], schedule: null, totals: NO_TOTALS }
  const bills = sampleBillsFor(lawyerId)
  return {
    bills,
    billable: sampleBillableFor(lawyerId),
    schedule: SAMPLE_SCHEDULE,
    totals: billTotals(bills),
  }
}

/** Without a backend: the draft the server would have numbered and opened. */
function newDraft(
  c: Billable,
  lawyer: Lawyer,
  number: string,
  schedule: BillSchedule | null,
): Bill {
  return {
    number,
    status: "draft",
    case: {
      ref: c.ref,
      category: c.category,
      outcome: c.outcome,
      closedAt: c.closedAt,
      client: c.client,
    },
    lawyer: { id: lawyer.id, name: lawyer.name, enrolment: lawyer.enrolment },
    ...(c.court ? { court: c.court } : {}),
    lines: [],
    claimedTotal: 0,
    scheduleVersion: schedule?.version ?? SAMPLE_SCHEDULE.version,
  }
}

/** Without a backend: the line the server would have added, with the head's ceiling on it. */
function newLine(draft: BillLineDraft, schedule: BillSchedule | null): BillLine {
  const ceilingTaka = headOf(schedule, draft.head)?.ceilingTaka ?? draft.claimedTaka
  return {
    id: `local-${Date.now()}`,
    head: draft.head,
    description: { en: draft.description, bn: draft.description },
    incurredOn: draft.incurredOn,
    claimedTaka: draft.claimedTaka,
    ...(draft.voucherRef ? { voucherRef: draft.voucherRef } : {}),
    ceilingTaka,
    overCeiling: draft.claimedTaka > ceilingTaka,
  }
}

/**
 * The signed-in lawyer's bills (the Bill Gadget). With a backend (VITE_API_URL) they come
 * from the server, with the gazetted fee schedule, and every change is shown once the
 * server has accepted it; without one, the built-in sample bills are used and the changes
 * stay on this screen.
 */
export function BillsProvider({ children }: { children: ReactNode }) {
  const live = apiEnabled()
  const lawyer = useLawyer()
  const [state, apply] = useReducer(billsReducer, undefined, () => initialState(live, lawyer.id))
  const [sync, setSync] = useState<BillsSync>(live ? "loading" : "ready")
  const { bills, billable, schedule, totals } = state

  const reload = useCallback(() => {
    Promise.all([fetchMyBills(lawyer.id), fetchBillSchedule(lawyer.id)]).then(
      ([mine, gazette]) => {
        apply({ type: "load", ...mine, schedule: gazette })
        setSync("ready")
      },
      () => setSync("error"),
    )
  }, [lawyer.id])

  useEffect(() => {
    if (live) reload()
  }, [live, reload])

  const retry = useCallback(() => {
    setSync("loading")
    reload()
  }, [reload])

  const refresh = useCallback(
    (number: string) => {
      if (!live) return
      fetchBill(number, lawyer.id).then(
        (bill) => apply({ type: "replace", bill }),
        () => {}, // the list copy stays on screen
      )
    },
    [live, lawyer.id],
  )

  const startBill = useCallback(
    async (c: Billable) => {
      const bill = live
        ? await postBill(c.ref, c.court ? { courtId: c.court.id } : {}, lawyer.id)
        : newDraft(c, lawyer, nextBillNumber(bills, new Date().getFullYear()), schedule)
      apply({ type: "startBill", bill })
      return bill
    },
    [live, lawyer, bills, schedule],
  )

  const addLine = useCallback(
    async (bill: Bill, draft: BillLineDraft) => {
      if (live) {
        const lines = [...bill.lines.map(toLineDraft), draft]
        apply({ type: "replace", bill: await putBillLines(bill.number, { lines }, lawyer.id) })
        return
      }
      apply({
        type: "saveLines",
        number: bill.number,
        lines: [...bill.lines, newLine(draft, schedule)],
      })
    },
    [live, lawyer.id, schedule],
  )

  const removeLine = useCallback(
    async (bill: Bill, lineId: string) => {
      const kept = bill.lines.filter((l) => l.id !== lineId)
      if (live) {
        const lines = kept.map(toLineDraft)
        apply({ type: "replace", bill: await putBillLines(bill.number, { lines }, lawyer.id) })
        return
      }
      apply({ type: "saveLines", number: bill.number, lines: kept })
    },
    [live, lawyer.id],
  )

  const submitBill = useCallback(
    async (bill: Bill) => {
      if (live) {
        apply({ type: "replace", bill: await postBillSubmit(bill.number, lawyer.id) })
        return
      }
      apply({ type: "submit", number: bill.number, at: new Date().toISOString() })
    },
    [live, lawyer.id],
  )

  const value = useMemo(
    () => ({
      bills,
      billable,
      schedule,
      totals,
      sync,
      retry,
      refresh,
      startBill,
      addLine,
      removeLine,
      submitBill,
    }),
    [
      bills,
      billable,
      schedule,
      totals,
      sync,
      retry,
      refresh,
      startBill,
      addLine,
      removeLine,
      submitBill,
    ],
  )
  return <BillsContext.Provider value={value}>{children}</BillsContext.Provider>
}

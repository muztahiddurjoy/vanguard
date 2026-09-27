import type { Bill, Billable, BillLine, BillSchedule, BillTotals } from "@/data/types"
import { billTotals } from "@/lib/bills"

export interface BillsState {
  bills: Bill[]
  billable: Billable[]
  schedule: BillSchedule | null
  totals: BillTotals
}

export const NO_TOTALS: BillTotals = { claimed: 0, allowed: 0, released: 0, awaitingCourt: 0 }

export type BillsAction =
  | {
      type: "load"
      bills: Bill[]
      billable: Billable[]
      schedule: BillSchedule
      totals: BillTotals
    }
  /** A bill just opened for a closed case (the server's, or this screen's without a backend). */
  | { type: "startBill"; bill: Bill }
  /** The bill's lines as they now stand; without a backend, by the server's rules. */
  | { type: "saveLines"; number: string; lines: BillLine[] }
  /** Without a backend: the bill goes to the court. */
  | { type: "submit"; number: string; at: string }
  /** A bill as the server now has it (after a change, or on opening it). */
  | { type: "replace"; bill: Bill }

/** The totals always follow the bills on screen, so the tiles and the list agree. */
function withBills(state: BillsState, bills: Bill[]): BillsState {
  return { ...state, bills, totals: billTotals(bills) }
}

function map(bills: Bill[], number: string, change: (b: Bill) => Bill) {
  return bills.map((b) => (b.number === number ? change(b) : b))
}

export function billsReducer(state: BillsState, action: BillsAction): BillsState {
  switch (action.type) {
    case "load":
      return {
        bills: action.bills,
        billable: action.billable,
        schedule: action.schedule,
        totals: action.totals,
      }
    case "startBill":
      // The case is no longer waiting for a bill.
      return withBills(
        { ...state, billable: state.billable.filter((c) => c.ref !== action.bill.case.ref) },
        [action.bill, ...state.bills],
      )
    case "saveLines":
      return withBills(
        state,
        map(state.bills, action.number, (b) => ({
          ...b,
          lines: action.lines,
          claimedTotal: action.lines.reduce((total, l) => total + l.claimedTaka, 0),
        })),
      )
    case "submit":
      return withBills(
        state,
        map(state.bills, action.number, (b) => {
          // The court has it again: its earlier decision on a returned bill no longer stands.
          const next: Bill = { ...b, status: "submitted", submittedAt: action.at }
          delete next.decidedAt
          delete next.decisionNote
          return next
        }),
      )
    case "replace":
      return withBills(
        state,
        map(state.bills, action.bill.number, () => action.bill),
      )
  }
}

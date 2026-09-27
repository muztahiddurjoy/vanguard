import { createContext } from "react"

import type { Bill, Billable, BillLineDraft, BillSchedule, BillTotals } from "@/data/types"

/** Only with a backend: whether the lawyer's bills have arrived. */
export type BillsSync = "ready" | "loading" | "error"

export interface BillsValue {
  bills: Bill[]
  /** Closed cases with no bill yet. */
  billable: Billable[]
  /** The gazetted fee schedule; null only while it is still on its way. */
  schedule: BillSchedule | null
  totals: BillTotals
  sync: BillsSync
  retry: () => void
  /** Fetches one bill again, when there is a backend. */
  refresh: (number: string) => void
  /** Opens a bill for a closed case, and answers with it. Rejects if the server refuses. */
  startBill: (c: Billable) => Promise<Bill>
  /** Adds one line to a draft (or to a bill the court returned). */
  addLine: (bill: Bill, line: BillLineDraft) => Promise<void>
  removeLine: (bill: Bill, lineId: string) => Promise<void>
  /** Sends the bill to the court. */
  submitBill: (bill: Bill) => Promise<void>
}

export const BillsContext = createContext<BillsValue | null>(null)

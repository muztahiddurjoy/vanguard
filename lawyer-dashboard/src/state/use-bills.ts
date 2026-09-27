import { useContext } from "react"

import { BillsContext } from "@/state/bills-context"

export function useBills() {
  const ctx = useContext(BillsContext)
  if (!ctx) throw new Error("useBills must be used inside <BillsProvider>")
  return ctx
}

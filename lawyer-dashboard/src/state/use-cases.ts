import { useContext } from "react"

import { CasesContext } from "@/state/cases-context"

export function useCases() {
  const ctx = useContext(CasesContext)
  if (!ctx) throw new Error("useCases must be used inside <CasesProvider>")
  return ctx
}

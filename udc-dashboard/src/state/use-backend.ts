import { useContext } from "react"

import { BackendContext } from "@/state/backend-context"

export function useBackend() {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error("useBackend must be used inside <BackendProvider>")
  return ctx
}

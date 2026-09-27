import { createContext } from "react"

import type { Centre } from "@/data/types"

export interface AuthValue {
  user: Centre | null
  /** The login form checks the ID (with the server, when there is one) before this. */
  signIn: (centre: Centre, remember: boolean) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

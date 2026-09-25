import { createContext } from "react"

import type { Lawyer } from "@/data/types"

export interface AuthValue {
  user: Lawyer | null
  /** The login form checks the ID (with the server, when there is one) before this. */
  signIn: (lawyer: Lawyer, remember: boolean) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

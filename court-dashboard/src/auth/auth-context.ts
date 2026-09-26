import { createContext } from "react"

import type { CourtStaff } from "@/data/types"

export interface AuthValue {
  user: CourtStaff | null
  /** The login form checks the ID (with the server, when there is one) before this. */
  signIn: (staff: CourtStaff, remember: boolean) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

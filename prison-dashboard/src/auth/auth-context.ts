import { createContext } from "react"

import type { JailStaff } from "@/data/types"

export interface AuthValue {
  user: JailStaff | null
  /** The login form checks the ID (with the server, when there is one) before this. */
  signIn: (staff: JailStaff, remember: boolean) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

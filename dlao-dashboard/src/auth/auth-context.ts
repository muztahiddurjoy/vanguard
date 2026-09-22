import { createContext } from "react"

import type { Officer } from "@/data/types"

export interface AuthValue {
  user: Officer | null
  /** Prototype sign-in: any officer ID works; the form enforces a minimum password length. */
  signIn: (officerId: string, remember: boolean) => void
  signOut: () => void
  updateUser: (patch: Partial<Pick<Officer, "email" | "phone">>) => void
}

export const AuthContext = createContext<AuthValue | null>(null)

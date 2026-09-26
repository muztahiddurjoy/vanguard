import { createContext } from "react"

import type { CourtBackend } from "@/data/backend"

export const BackendContext = createContext<CourtBackend | null>(null)

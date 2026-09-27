import { createContext } from "react"

import type { UdcBackend } from "@/data/backend"

export const BackendContext = createContext<UdcBackend | null>(null)

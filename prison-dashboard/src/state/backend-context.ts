import { createContext } from "react"

import type { JailBackend } from "@/data/types"

export const BackendContext = createContext<JailBackend | null>(null)

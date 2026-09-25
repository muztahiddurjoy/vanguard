/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The DLAS backend, e.g. http://localhost:8000. Unset: the built-in cases are shown. */
  readonly VITE_API_URL?: string
  /** The backend's shared API_TOKEN, if it has one. */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

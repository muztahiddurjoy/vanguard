import { useEffect } from "react"

/** Sets the browser tab title, e.g. "Work queue · DLAS". */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · DLAS`
  }, [title])
}

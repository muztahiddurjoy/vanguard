import { centreOfActor } from "@/data/centres"
import { useI18n } from "@/i18n/use-i18n"

/**
 * Names whoever the server recorded as acting ("udc:UDC-MTP"), or shows it as it came.
 * A centre acts as its entrepreneur, which is the name to show.
 */
export function useActorName() {
  const { lang } = useI18n()
  return (actor: string | null | undefined) => {
    if (!actor) return "—"
    const centre = centreOfActor(actor)
    if (!centre) return actor
    return (lang === "bn" && centre.entrepreneurBn) || centre.entrepreneur
  }
}

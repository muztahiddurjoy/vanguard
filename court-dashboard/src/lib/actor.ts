import { staffOfActor } from "@/data/courts"
import { useI18n } from "@/i18n/use-i18n"

/** Names whoever the server recorded as acting ("court:CS-11"), or shows it as it came. */
export function useActorName() {
  const { pickName } = useI18n()
  return (actor: string | null | undefined) => {
    if (!actor) return "—"
    const staff = staffOfActor(actor)
    return staff ? pickName(staff) : actor
  }
}

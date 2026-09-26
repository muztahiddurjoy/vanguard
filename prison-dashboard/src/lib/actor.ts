import { staffOfActor } from "@/data/prisons"
import { useI18n } from "@/i18n/use-i18n"

/** Names whoever the server recorded as acting ("prison:JS-08"), or shows it as it came. */
export function useActorName() {
  const { pick } = useI18n()
  return (actor: string | null | undefined) => {
    if (!actor) return "—"
    const staff = staffOfActor(actor)
    return staff ? pick(staff.name) : actor
  }
}

import type { ComponentProps } from "react"
import { Link, type LinkProps } from "react-router"

import { Button } from "@/components/ui/button"

/**
 * A link styled as a button. Base UI needs `nativeButton={false}` whenever a
 * Button renders something other than <button>, so links keep link semantics.
 */
export function ButtonLink({
  to,
  ...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton"> & Pick<LinkProps, "to">) {
  // Base UI gives a non-<button> the button role; a link says it is one.
  return <Button nativeButton={false} render={<Link to={to} />} role="link" {...props} />
}

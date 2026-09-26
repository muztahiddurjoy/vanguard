import type { ComponentProps } from "react"
import type { VariantProps } from "class-variance-authority"
import { Link } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@/components/ui/button"

/**
 * A link styled as a button. It stays a real <a> (Base UI's Button would give a
 * non-native element role="button"), so it is announced and opened as a link.
 */
export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return (
    <Link data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}

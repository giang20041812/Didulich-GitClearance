import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-primary)] text-white",
        secondary:
          "border-transparent bg-[var(--color-secondary)] text-[var(--color-ink-deep)]",
        accent:
          "border-transparent bg-[var(--color-accent)] text-[var(--color-ink-deep)]",
        outline: "text-[var(--color-ink)] border-[var(--color-muted)]",
        danger:
          "border-transparent bg-[var(--color-danger)] text-white",
        "local-experience":
          "border-transparent bg-[var(--color-primary-light)] text-[var(--color-ink-deep)]",
        eco:
          "border-transparent bg-[var(--color-accent-light)] text-[var(--color-ink-deep)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

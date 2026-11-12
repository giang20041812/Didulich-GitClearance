import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/cn"
import { Loader2 } from "lucide-react"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "cta cta-primary text-white",
        secondary: "cta cta-aqua text-white font-semibold",
        accent: "cta cta-sun text-white font-semibold",
        outline:
          "cta cta-outline border border-[var(--color-primary)] text-[var(--color-primary)]",
        ghost: "cta cta-ghost text-[var(--color-primary)]",
      },
      size: {
        lg: "h-12 px-8 text-[18px]",
        md: "h-10 px-4 py-2 text-[16px]",
        sm: "h-8 px-3 text-[14px]",
        icon: "h-10 w-10 flex-shrink-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

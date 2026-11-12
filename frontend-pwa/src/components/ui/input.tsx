import * as React from "react"
import { cn } from "../../lib/cn"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  startIcon?: React.ReactNode;
  helpText?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, startIcon, helpText, disabled, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        <div className="relative w-full flex items-center">
          {startIcon && (
            <div className={cn("absolute left-3 flex items-center justify-center pointer-events-none", disabled ? "text-[var(--color-muted)]/50" : (error ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"))}>
              {startIcon}
            </div>
          )}
          <input
            type={type}
            disabled={disabled}
            className={cn(
              "flex h-12 w-full rounded-md border bg-[var(--color-surface)] py-2 text-[15px] font-medium text-[var(--color-ink)] transition-colors shadow-sm",
              startIcon ? "pl-10 pr-4" : "px-4",
              "placeholder:text-[var(--color-muted)] placeholder:font-normal",
              "focus-visible:outline-none focus-visible:ring-1",
              disabled && "cursor-not-allowed bg-[var(--color-muted)]/10 text-[var(--color-muted)] border-transparent shadow-none",
              error
                ? "border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)] focus-visible:border-[var(--color-danger)]"
                : "border-[var(--color-muted)]/40 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)] hover:border-[var(--color-muted)]/60",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {helpText && (
          <div className={cn("text-xs flex items-center gap-1", error ? "text-[var(--color-danger)]" : (disabled ? "text-[var(--color-muted)]/50" : "text-[var(--color-muted)]"))}>
            {helpText}
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }

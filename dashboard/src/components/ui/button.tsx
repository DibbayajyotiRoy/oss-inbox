import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Spinner } from "./spinner"

// Hover role "button": the fill deepens and the button lifts 1px; press sinks it to 98%. Icon buttons use a pill instead.
const lift = "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0"

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap outline-none select-none " +
    "motion-safe:transition-[translate,scale,background-color,color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle motion-safe:active:scale-[0.98] " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
    "aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: `${lift} bg-primary text-primary-foreground hover:bg-primary-hover`,
        secondary: `${lift} bg-secondary text-secondary-foreground hover:bg-accent`,
        outline: `${lift} border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-transparent`,
        ghost: `${lift} text-muted-foreground hover:bg-accent hover:text-accent-foreground`,
        destructive:
          `${lift} bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/60 dark:bg-destructive/60 dark:hover:bg-destructive/70`,
        link: "text-brand underline-offset-4 link-grow",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        md: "h-9 px-4 has-[>svg]:px-3",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    compoundVariants: [
      { variant: "link", className: "h-auto px-0 has-[>svg]:px-0" },
      // Hover role "icon button": no lift or fill swap, a pill fades in behind the glyph.
      { size: ["icon", "icon-sm"], className: "hover-pill motion-safe:hover:translate-y-0 hover:bg-transparent dark:hover:bg-transparent" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  }
)

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner and disables the button. */
  loading?: boolean
}

function Button({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      type={asChild ? type : (type ?? "button")}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }

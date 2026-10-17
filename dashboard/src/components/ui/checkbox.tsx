import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  /** shadcn-style callback, in addition to the native `onChange`. */
  onCheckedChange?: (checked: boolean) => void
}

/** shadcn look on a native `<input type="checkbox">`: works in plain forms (`name`, `defaultChecked`) and with `onChange`. */
function Checkbox({ className, onChange, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <span data-slot="checkbox-wrapper" className={cn("relative inline-flex size-4 shrink-0", className)}>
      <input
        type="checkbox"
        data-slot="checkbox"
        onChange={(e) => {
          onChange?.(e)
          onCheckedChange?.(e.target.checked)
        }}
        className={cn(
          "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-input bg-background shadow-xs outline-none dark:bg-input/30",
          "checked:border-primary checked:bg-primary dark:checked:bg-primary",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        )}
        {...props}
      />
      <CheckIcon
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
}

export { Checkbox }

"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "./button"
import { SwapText } from "./presence"
import { toast } from "./toaster"

export async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  // Non-secure contexts (plain http on a LAN host) have no async clipboard.
  const el = document.createElement("textarea")
  el.value = value
  el.setAttribute("readonly", "")
  el.style.cssText = "position:fixed;opacity:0"
  document.body.appendChild(el)
  el.select()
  document.execCommand("copy")
  el.remove()
}

const iconMotion = "absolute inset-0 size-4 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-settle"

/** Copies `value`; the icon crossfades to a check for 1.5s. Icon-only unless `label` is given. */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "ghost",
  className,
}: { value: string; label?: string } & Pick<ButtonProps, "size" | "variant" | "className">) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await writeClipboard(value)
      setCopied(true)
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <Button
      variant={variant}
      size={label ? size : size === "sm" ? "icon-sm" : "icon"}
      onClick={copy}
      aria-label={label ? undefined : copied ? "Copied" : "Copy to clipboard"}
      className={className}
    >
      <span aria-hidden className="relative inline-block size-4">
        <Copy className={cn(iconMotion, copied ? "scale-75 opacity-0" : "scale-100 opacity-100")} />
        <Check className={cn(iconMotion, copied ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
      </span>
      {label ? <SwapText value={copied ? "Copied" : label} /> : null}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Button>
  )
}

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

/** Radix-based shadcn Select root, for call sites that compose the parts directly. */
function SelectRoot({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

/* ------------------------------------------------------------------------- */
/* Select: drop-in replacement for a native <select>                         */
/* ------------------------------------------------------------------------- */

/**
 * Native `<select>` popups are drawn by the OS (grey list, blue highlight,
 * system font) and ignore the theme. `Select` keeps the familiar
 * `<Select value onChange><option/></Select>` API but renders the Radix
 * listbox so every dropdown shares the popover styling.
 */
export interface SelectChangeEvent {
  target: { value: string; name: string }
  currentTarget: { value: string; name: string }
}

export interface SelectProps
  extends Omit<
    React.ComponentProps<"select">,
    "size" | "onChange" | "value" | "defaultValue" | "multiple" | "ref"
  > {
  value?: string | number
  defaultValue?: string | number
  /** Called with a minimal event whose `target.value` is the chosen option value. */
  onChange?: (event: SelectChangeEvent) => void
  onValueChange?: (value: string) => void
  /** Classes for the wrapper (width, margins). `className` styles the trigger. */
  wrapperClassName?: string
  size?: "sm" | "default"
  placeholder?: string
}

/** Radix forbids `value=""` on items; the empty option maps to this internally. */
const EMPTY = "__select-empty__"
const toRadix = (v: string) => (v === "" ? EMPTY : v)
const fromRadix = (v: string) => (v === EMPTY ? "" : v)

type ParsedOption = { kind: "option"; value: string; label: React.ReactNode; text: string; disabled?: boolean }
type ParsedGroup = { kind: "group"; label: string; options: ParsedOption[] }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function parseOptions(children: React.ReactNode): (ParsedOption | ParsedGroup)[] {
  const out: (ParsedOption | ParsedGroup)[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      out.push(...parseOptions((child.props as { children?: React.ReactNode }).children))
      return
    }
    if (child.type === "option") {
      const p = child.props as React.ComponentProps<"option">
      const text = textOf(p.children)
      out.push({
        kind: "option",
        value: p.value != null ? String(p.value) : text,
        label: p.children,
        text,
        disabled: p.disabled,
      })
      return
    }
    if (child.type === "optgroup") {
      const p = child.props as React.ComponentProps<"optgroup">
      out.push({
        kind: "group",
        label: p.label ?? "",
        options: parseOptions(p.children).filter((o): o is ParsedOption => o.kind === "option"),
      })
    }
  })
  return out
}

function Select({
  value,
  defaultValue,
  onChange,
  onValueChange,
  name,
  disabled,
  required,
  form,
  autoComplete,
  children,
  className,
  wrapperClassName,
  size = "default",
  placeholder,
  ...triggerProps
}: SelectProps) {
  const options = React.useMemo(() => parseOptions(children), [children])

  const handleValueChange = (next: string) => {
    const v = fromRadix(next)
    onValueChange?.(v)
    if (onChange) {
      const target = { value: v, name: name ?? "" }
      onChange({ target, currentTarget: target })
    }
  }

  const renderOption = (o: ParsedOption) => (
    <SelectItem key={o.value} value={toRadix(o.value)} disabled={o.disabled} title={o.text || undefined}>
      {o.label}
    </SelectItem>
  )

  return (
    <div data-slot="select-wrapper" className={cn("w-full min-w-0", wrapperClassName)}>
      <SelectRoot
        value={value !== undefined ? toRadix(String(value)) : undefined}
        defaultValue={defaultValue !== undefined ? toRadix(String(defaultValue)) : undefined}
        onValueChange={handleValueChange}
        name={name}
        disabled={disabled}
        required={required}
        form={form}
        autoComplete={autoComplete}
      >
        <SelectTrigger
          size={size}
          className={cn("w-full", className)}
          {...(triggerProps as React.ComponentProps<typeof SelectPrimitive.Trigger>)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((entry) =>
            entry.kind === "option" ? (
              renderOption(entry)
            ) : (
              <SelectGroup key={`group-${entry.label}`}>
                {entry.label ? <SelectLabel>{entry.label}</SelectLabel> : null}
                {entry.options.map(renderOption)}
              </SelectGroup>
            )
          )}
        </SelectContent>
      </SelectRoot>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Parts                                                                     */
/* ------------------------------------------------------------------------- */

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm whitespace-nowrap shadow-xs outline-none transition-[border-color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 data-[state=open]:border-ring *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/**
 * Popper-positioned by default: portals to <body> (escapes the scroll root and
 * overflow clips), sits 4px off the trigger, is at least as wide as it, flips
 * and shrinks to stay 8px inside the viewport, and scrolls internally.
 */
function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-0.5 data-[side=left]:slide-in-from-right-0.5 data-[side=right]:slide-in-from-left-0.5 data-[side=top]:slide-in-from-bottom-0.5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-97 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97",
          position === "popper" &&
            "max-w-(--radix-select-content-available-width) min-w-(--radix-select-trigger-width)",
          className
        )}
        position={position}
        align={align}
        sideOffset={position === "popper" ? sideOffset : undefined}
        collisionPadding={collisionPadding}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-8 w-full cursor-default items-center gap-2 rounded-sm pr-8 pl-2 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-foreground" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <span className="block truncate">{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

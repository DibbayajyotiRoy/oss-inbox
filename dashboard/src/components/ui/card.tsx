import * as React from "react"
import { cn } from "@/lib/utils"
import { TitleWithHint } from "./info-hint"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6 [.border-t]:pt-6", className)} {...props} />
}

/** A titled card: title (+ optional (i) `hint`), optional header `action`, content, optional footer. No nested cards. */
function CardSection({
  title,
  description,
  hint,
  action,
  children,
  footer,
  className,
  id,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Explanation for an (i) tooltip after the title, instead of a description line. */
  hint?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <Card id={id} className={cn("min-w-0 scroll-mt-6", className)}>
      <CardHeader>
        <CardTitle className="text-base">
          <TitleWithHint hint={hint}>{title}</TitleWithHint>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction className="flex items-center gap-2">{action}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent className="min-w-0">{children}</CardContent> : null}
      {footer ? <CardFooter className="gap-2 border-t">{footer}</CardFooter> : null}
    </Card>
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, CardSection }

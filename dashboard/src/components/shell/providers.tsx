"use client"

import * as React from "react"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * next-themes always renders its no-flash init <script>. React 19 logs a warning when it creates an
 * executable script on the client, so the client copy is an inert data block (the server HTML keeps the
 * real one, and a client-created script would never run anyway).
 */
const THEME_SCRIPT_PROPS = typeof window === "undefined" ? undefined : ({ type: "application/json" } as const)

/** Theme (class strategy, dark default, follows the system when chosen), tooltips and toasts for the whole app. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange scriptProps={THEME_SCRIPT_PROPS}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster />
    </ThemeProvider>
  )
}

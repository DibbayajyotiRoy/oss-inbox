import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/onboarding/flow";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Any unknown URL, and `notFound()` anywhere. Themed by the root layout, so it follows light and dark. */
export default function NotFound() {
  return (
    <Frame>
      <div className="mx-auto flex w-full max-w-sm flex-col items-center px-4 pt-[18vh] text-center">
        <p className="font-mono text-sm text-muted-foreground tabular-nums">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have moved, or you may not have access to it.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">Open the dashboard</Link>
        </Button>
      </div>
    </Frame>
  );
}

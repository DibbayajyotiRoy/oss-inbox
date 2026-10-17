"use client";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/use-api";

type Status = { install_url: string | null; setup_url: string | null };

/**
 * Link to add repositories to the GitHub App installation. Renders nothing until the instance reports where.
 * `setup`: when the app does not exist yet, link to the setup flow instead of hiding.
 */
export function InstallLink({ children = "Add repositories", variant = "outline", setup }: { children?: React.ReactNode; variant?: "outline" | "primary"; setup?: boolean }) {
  const s = useApi<Status>("/api/setup/status").data;
  const href = s?.install_url ?? (setup ? s?.setup_url : null);
  if (!href) return null;
  return (
    <Button asChild variant={variant} size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        {s?.install_url ? children : "Set up the GitHub App"}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}

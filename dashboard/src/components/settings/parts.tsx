"use client";
import { cloneElement, useState, type ReactElement } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errText } from "@/lib/api";

/** Runs a mutation with a busy flag; a failure becomes an error toast and resolves to undefined. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Disables its child and explains why in a tooltip. A falsy `reason` renders the child untouched. */
export function Gate({ reason, children }: { reason: string | false | undefined; children: ReactElement<{ disabled?: boolean }> }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {cloneElement(children, { disabled: true })}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Opens GitHub's editor. Copies the YAML first when the file exists, because that editor URL cannot prefill it. */
export function GithubLink({ href, yaml, reason, variant = "primary", children }: {
  href: string;
  yaml: string;
  reason?: string | false;
  variant?: "primary" | "outline";
  children: string;
}) {
  const icon = <ExternalLink aria-hidden />;
  const copy = () => {
    if (!href.includes("/edit/")) return;
    navigator.clipboard?.writeText(yaml).then(() => toast.success("YAML copied", { description: "Paste it into the GitHub editor." }), () => {});
  };
  return (
    <Gate reason={reason}>
      {reason ? (
        <Button variant={variant}>{children}{icon}</Button>
      ) : (
        <Button asChild variant={variant}>
          <a href={href} target="_blank" rel="noreferrer noopener" onClick={copy}>{children}{icon}</a>
        </Button>
      )}
    </Gate>
  );
}

export function Confirm({ open, onOpenChange, title, description, label, busy, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={busy} onClick={onConfirm}>{label}</Button>
        </>
      }
    />
  );
}

export const RowsSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div role="status" aria-busy="true" className="flex flex-col gap-3">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    <span className="sr-only">Loading</span>
  </div>
);

/** ["Oct 17", "11:42 AM"]; the year joins the date only when it is not this one. */
export const stampParts = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return [d.toLocaleDateString(undefined, { month: "short", day: "numeric", year }), d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })];
};
export const stamp = (iso: string) => stampParts(iso).join(", ");

import { CardSection } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the CI gate: outcome card, then report rows. */
export function CiSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <CardSection title="Outcomes">
        <Skeleton className="h-24 w-full" />
      </CardSection>
      <ul className="divide-y rounded-xl border bg-card">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="grid gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:px-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-48 sm:col-start-2" />
          </li>
        ))}
      </ul>
    </div>
  );
}

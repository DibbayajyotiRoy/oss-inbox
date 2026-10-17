import { CardSection } from "@/components/ui/card";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui/stat-strip";

/** Mirrors the org overview: header, five readings, trend card, two repo cards. */
export function OverviewSkeleton() {
  return (
    <Busy className="flex flex-col gap-10">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2.5 h-4 w-64" />
      </div>
      <StatStrip className="lg:grid-cols-5 max-sm:[&>*:last-child]:col-span-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-8 w-14" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </StatStrip>
      <CardSection title="Last 30 days">
        <Skeleton className="h-52 w-full sm:h-64" />
      </CardSection>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-14" />
              ))}
            </div>
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </div>
    </Busy>
  );
}

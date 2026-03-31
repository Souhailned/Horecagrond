import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Overname Intelligence" />
      <ContentCardBody className="p-4 space-y-6">
        {/* Stats row skeleton — matches StatCard layout */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-muted/50 px-4 py-3"
            >
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>

        {/* Section header skeleton */}
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-6" />
        </div>

        {/* Profile cards skeleton — matches ProfileCard layout */}
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-background px-4 py-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-56" />
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-8 w-28 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Profiel laden..." />
      <ContentCardBody className="p-4 space-y-4">
        {/* Profile summary skeleton */}
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-64" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-36" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs skeleton */}
        <Skeleton className="h-9 w-[440px] rounded-lg" />

        {/* Filter bar skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-[140px] rounded-md" />
          <Skeleton className="h-8 w-[120px] rounded-md" />
          <Skeleton className="h-8 w-[120px] rounded-md" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2 w-24 rounded-full" />
          </div>
        </div>

        {/* Results count skeleton */}
        <Skeleton className="h-3.5 w-32" />

        {/* Match cards skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-background p-4 space-y-3"
            >
              {/* Score + business info row */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <Skeleton className="h-2.5 w-6" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4.5 w-48" />
                  <Skeleton className="h-3 w-36" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>

              {/* Score breakdown skeleton */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-10" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-0.5">
                    <Skeleton className="h-2.5 w-8" />
                    <Skeleton className="h-1.5 w-8 rounded-full" />
                  </div>
                ))}
              </div>

              {/* Signal badges skeleton */}
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>

              {/* Actions skeleton */}
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <Skeleton className="h-7 w-[120px] rounded-md" />
                <div className="flex items-center gap-1">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="size-7 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

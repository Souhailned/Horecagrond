import {
  ContentCard,
  ContentCardHeader,
} from "@/components/dashboard/content-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Leads" />

      {/* Filter row skeleton */}
      <div className="flex items-center justify-between px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>

      {/* Summary skeleton */}
      <div className="px-4 pb-3">
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Card skeletons */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </ContentCard>
  );
}

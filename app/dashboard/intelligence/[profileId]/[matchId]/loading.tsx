import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Match laden..." />
      <ContentCardBody className="p-4 space-y-6">
        {/* Header bar skeleton: score + name + address */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>

        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full max-w-xl rounded-lg" />

        {/* Tab content skeleton */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>

        {/* Bottom bar skeleton */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-20 flex-1 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

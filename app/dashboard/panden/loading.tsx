import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Panden">
        {/* Toolbar skeleton */}
        <div className="flex flex-col gap-3 w-full">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
          {/* Status chips skeleton */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
      </ContentCardHeader>
      <ContentCardBody className="p-0">
        {/* Table header skeleton */}
        <div className="border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-6">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
        {/* Table rows skeleton */}
        <div className="divide-y divide-border/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="h-9 w-12 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-6 w-6 rounded-md" />
            </div>
          ))}
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <ContentCard>
      <ContentCardHeader title="Laden..." />
      <ContentCardBody className="p-6 space-y-6">
        {/* Views over time skeleton */}
        <Skeleton className="h-[280px] w-full rounded-xl" />

        {/* Sources + Devices row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[250px] rounded-xl" />
          <Skeleton className="h-[250px] rounded-xl" />
        </div>

        {/* Engagement + Pipeline row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[250px] rounded-xl" />
          <Skeleton className="h-[250px] rounded-xl" />
        </div>
      </ContentCardBody>
    </ContentCard>
  )
}

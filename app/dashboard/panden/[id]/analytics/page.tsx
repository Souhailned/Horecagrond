import { notFound } from "next/navigation"
import { requirePagePermission } from "@/lib/session"
import prisma from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  ArrowSquareOut,
  PencilSimple,
  ChartBar,
} from "@phosphor-icons/react/dist/ssr"
import { PropertyPageTabs } from "@/components/property/property-page-tabs"
import {
  PropertyAnalyticsCharts,
  type PropertyAnalyticsChartsProps,
} from "@/components/dashboard/property-analytics-charts"

export default async function PropertyAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await requirePagePermission("properties:edit-own")

  // ── Fetch property ────────────────────────────────────────────────
  const property = await prisma.property.findFirst({
    where: { id, createdById: userId },
    select: {
      id: true,
      title: true,
      slug: true,
      viewCount: true,
      publishedAt: true,
    },
  })

  if (!property) notFound()

  // ── Fetch analytics data in parallel ──────────────────────────────
  const [
    viewsPerDayRaw,
    viewsBySourceRaw,
    viewsByDeviceRaw,
    totalViews,
    imgViews,
    mapViews,
    contactViews,
    phoneClicks,
    inquiryPipelineRaw,
    inquiriesPerWeekRaw,
  ] = await Promise.all([
    // Views per day (last 30 days)
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("viewedAt")::text as date, COUNT(*)::bigint as count
      FROM "property_view"
      WHERE "propertyId" = ${id} AND "viewedAt" > NOW() - INTERVAL '30 days'
      GROUP BY DATE("viewedAt")
      ORDER BY date
    `,

    // Views by source
    prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
      SELECT COALESCE("source", 'direct') as source, COUNT(*)::bigint as count
      FROM "property_view"
      WHERE "propertyId" = ${id}
      GROUP BY "source"
      ORDER BY count DESC
    `,

    // Views by device
    prisma.$queryRaw<Array<{ device: string; count: bigint }>>`
      SELECT COALESCE("deviceType", 'unknown') as device, COUNT(*)::bigint as count
      FROM "property_view"
      WHERE "propertyId" = ${id}
      GROUP BY "deviceType"
      ORDER BY count DESC
    `,

    // Engagement counts
    prisma.propertyView.count({ where: { propertyId: id } }),
    prisma.propertyView.count({ where: { propertyId: id, viewedImages: true } }),
    prisma.propertyView.count({ where: { propertyId: id, viewedMap: true } }),
    prisma.propertyView.count({ where: { propertyId: id, viewedContact: true } }),
    prisma.propertyView.count({ where: { propertyId: id, clickedPhone: true } }),

    // Inquiry pipeline
    prisma.propertyInquiry.groupBy({
      by: ["status"],
      where: { propertyId: id },
      _count: true,
      orderBy: { _count: { status: "desc" } },
    }),

    // Inquiries per week (last 8 weeks)
    prisma.$queryRaw<Array<{ week: string; count: bigint }>>`
      SELECT TO_CHAR(DATE_TRUNC('week', "createdAt"), 'DD Mon') as week, COUNT(*)::bigint as count
      FROM "property_inquiry"
      WHERE "propertyId" = ${id} AND "createdAt" > NOW() - INTERVAL '8 weeks'
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY DATE_TRUNC('week', "createdAt")
    `,
  ])

  // ── Serialize BigInt to Number ────────────────────────────────────
  const viewsPerDay = viewsPerDayRaw.map((v) => ({
    date: v.date,
    count: Number(v.count),
  }))
  const viewsBySource = viewsBySourceRaw.map((v) => ({
    source: v.source,
    count: Number(v.count),
  }))
  const viewsByDevice = viewsByDeviceRaw.map((v) => ({
    device: v.device,
    count: Number(v.count),
  }))
  const inquiryPipeline = inquiryPipelineRaw.map((p) => ({
    status: p.status,
    count: p._count,
  }))
  const inquiriesPerWeek = inquiriesPerWeekRaw.map((w) => ({
    week: w.week,
    count: Number(w.count),
  }))

  const hasData = totalViews > 0

  const chartsProps: PropertyAnalyticsChartsProps = {
    viewsPerDay,
    viewsBySource,
    viewsByDevice,
    inquiryPipeline,
    inquiriesPerWeek,
    engagement: {
      totalViews,
      imgViews,
      mapViews,
      contactViews,
      phoneClicks,
    },
  }

  return (
    <ContentCard>
      <ContentCardHeader
        title={property.title}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/dashboard/panden">Mijn Panden</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/dashboard/panden/${property.id}`}>
                    {property.title}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Analytics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <div className="flex gap-2">
            <Link href={`/aanbod/${property.slug}`} target="_blank">
              <Button variant="outline" size="sm">
                <ArrowSquareOut className="mr-1.5 h-3.5 w-3.5" />
                Bekijken
              </Button>
            </Link>
            <Link href={`/dashboard/panden/${property.id}/bewerken`}>
              <Button size="sm">
                <PencilSimple className="mr-1.5 h-3.5 w-3.5" />
                Bewerken
              </Button>
            </Link>
          </div>
        }
      >
        <PropertyPageTabs propertyId={property.id} activeTab="analytics" />
      </ContentCardHeader>

      <ContentCardBody className="p-4 md:p-6">
        {hasData ? (
          <PropertyAnalyticsCharts {...chartsProps} />
        ) : (
          /* ── Empty state ─────────────────────────────────────── */
          <div className="flex h-60 flex-col items-center justify-center text-center">
            <div className="p-3 bg-muted rounded-md mb-4">
              <ChartBar
                className="h-6 w-6 text-foreground"
                weight="regular"
              />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Nog geen bezoekersdata
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Nog geen bezoekersdata beschikbaar. Data wordt verzameld zodra het
              pand bezoekers ontvangt.
            </p>
          </div>
        )}
      </ContentCardBody>
    </ContentCard>
  )
}

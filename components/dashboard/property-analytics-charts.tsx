"use client"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  Images,
  MapPin,
  EnvelopeSimple,
  Phone,
} from "@phosphor-icons/react"

// ─── Theme-compatible chart colors ───────────────────────────────────
const COLORS = {
  primary: "oklch(0.43 0.215 254.5)",
  primaryLight: "oklch(0.43 0.215 254.5 / 0.10)",
  muted: "oklch(0.556 0 0)",
  border: "oklch(0.295 0 0)",
  tooltipBg: "oklch(0.205 0 0)",
  tooltipBorder: "oklch(0.295 0 0)",
  tooltipText: "oklch(0.985 0 0)",
}

const PIE_COLORS = [
  "oklch(0.43 0.215 254.5)",   // primary blue
  "oklch(0.65 0.17 160)",      // teal
  "oklch(0.70 0.15 75)",       // amber
  "oklch(0.60 0.18 310)",      // purple
  "oklch(0.55 0.14 30)",       // orange
]

const BAR_COLORS = [
  "oklch(0.43 0.215 254.5)",
  "oklch(0.50 0.19 254.5)",
  "oklch(0.57 0.16 254.5)",
  "oklch(0.64 0.13 254.5)",
  "oklch(0.71 0.10 254.5)",
  "oklch(0.78 0.07 254.5)",
]

// ─── Tooltip style ──────────────────────────────────────────────────
const tooltipStyle = {
  backgroundColor: COLORS.tooltipBg,
  border: `1px solid ${COLORS.tooltipBorder}`,
  borderRadius: "8px",
  fontSize: "12px",
  color: COLORS.tooltipText,
}

// ─── Inquiry status labels (Dutch) ──────────────────────────────────
const INQUIRY_STATUS_LABELS: Record<string, string> = {
  NEW: "Nieuw",
  VIEWED: "Bekeken",
  CONTACTED: "Benaderd",
  VIEWING_SCHEDULED: "Bezichtiging",
  NEGOTIATING: "Onderhandeling",
  CLOSED_WON: "Deal",
  CLOSED_LOST: "Verloren",
  SPAM: "Spam",
}

// ─── Source labels (Dutch) ──────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  search: "Zoekmachines",
  social: "Social media",
  email: "E-mail",
  referral: "Verwijzing",
}

// ─── Device labels (Dutch) ──────────────────────────────────────────
const DEVICE_LABELS: Record<string, string> = {
  mobile: "Mobiel",
  desktop: "Desktop",
  tablet: "Tablet",
  unknown: "Onbekend",
}

// ─── Types ──────────────────────────────────────────────────────────
interface ViewsPerDay {
  date: string
  count: number
}

interface ViewsBySource {
  source: string
  count: number
}

interface ViewsByDevice {
  device: string
  count: number
}

interface InquiryPipelineItem {
  status: string
  count: number
}

interface InquiriesPerWeek {
  week: string
  count: number
}

interface EngagementData {
  totalViews: number
  imgViews: number
  mapViews: number
  contactViews: number
  phoneClicks: number
}

export interface PropertyAnalyticsChartsProps {
  viewsPerDay: ViewsPerDay[]
  viewsBySource: ViewsBySource[]
  viewsByDevice: ViewsByDevice[]
  inquiryPipeline: InquiryPipelineItem[]
  inquiriesPerWeek: InquiriesPerWeek[]
  engagement: EngagementData
}

// ─── Section wrapper ────────────────────────────────────────────────
function ChartSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────
export function PropertyAnalyticsCharts({
  viewsPerDay,
  viewsBySource,
  viewsByDevice,
  inquiryPipeline,
  inquiriesPerWeek,
  engagement,
}: PropertyAnalyticsChartsProps) {
  const { totalViews, imgViews, mapViews, contactViews, phoneClicks } =
    engagement

  // Format date labels for area chart
  const formattedViews = viewsPerDay.map((v) => ({
    ...v,
    label: new Date(v.date).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    }),
  }))

  // Prepare device data with labels + percentages
  const totalDeviceViews = viewsByDevice.reduce((sum, d) => sum + d.count, 0)
  const deviceData = viewsByDevice.map((d) => ({
    name: DEVICE_LABELS[d.device] || d.device,
    value: d.count,
    percentage:
      totalDeviceViews > 0
        ? ((d.count / totalDeviceViews) * 100).toFixed(0)
        : "0",
  }))

  // Prepare source data with labels
  const sourceData = viewsBySource.map((s) => ({
    name: SOURCE_LABELS[s.source] || s.source,
    count: s.count,
  }))

  // Prepare inquiry pipeline with labels
  const pipelineData = inquiryPipeline.map((p) => ({
    name: INQUIRY_STATUS_LABELS[p.status] || p.status,
    count: p.count,
  }))

  // Engagement items
  const engagementItems = [
    { label: "Foto's bekeken", count: imgViews, icon: Images },
    { label: "Kaart bekeken", count: mapViews, icon: MapPin },
    { label: "Contact bekeken", count: contactViews, icon: EnvelopeSimple },
    { label: "Telefoon geklikt", count: phoneClicks, icon: Phone },
  ]

  return (
    <div className="space-y-6">
      {/* ── Views over time (full width) ──────────────────────────── */}
      <ChartSection title="Views afgelopen 30 dagen">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={formattedViews}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLORS.primary}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={COLORS.primary}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: COLORS.muted }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.muted }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="count"
                name="Views"
                stroke={COLORS.primary}
                fill="url(#viewsGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartSection>

      {/* ── Row 2: Sources + Devices ─────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Traffic sources (horizontal bar) */}
        <ChartSection title="Traffic bronnen">
          {sourceData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceData}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: COLORS.muted }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    name="Views"
                    radius={[0, 4, 4, 0]}
                  >
                    {sourceData.map((_, index) => (
                      <Cell
                        key={`source-${index}`}
                        fill={BAR_COLORS[index % BAR_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nog geen brondata beschikbaar.
            </p>
          )}
        </ChartSection>

        {/* Device breakdown (donut) */}
        <ChartSection title="Apparaten">
          {deviceData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="h-[180px] w-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deviceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {deviceData.map((_, index) => (
                        <Cell
                          key={`device-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 min-w-0">
                {deviceData.map((d, index) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="inline-block size-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          PIE_COLORS[index % PIE_COLORS.length],
                      }}
                    />
                    <span className="text-sm text-muted-foreground truncate">
                      {d.name}
                    </span>
                    <span className="text-sm font-medium tabular-nums ml-auto">
                      {d.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nog geen apparaatdata beschikbaar.
            </p>
          )}
        </ChartSection>
      </div>

      {/* ── Row 3: Engagement + Inquiry pipeline ────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Engagement rates (progress bars) */}
        <ChartSection title="Engagement">
          <div className="space-y-4">
            {engagementItems.map((item) => {
              const rate =
                totalViews > 0 ? (item.count / totalViews) * 100 : 0
              const Icon = item.icon
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </span>
                    <span className="font-medium tabular-nums">
                      {rate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartSection>

        {/* Inquiry pipeline */}
        <ChartSection title="Aanvragen pipeline">
          {pipelineData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pipelineData}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: COLORS.muted }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    name="Aanvragen"
                    radius={[0, 4, 4, 0]}
                  >
                    {pipelineData.map((_, index) => (
                      <Cell
                        key={`pipeline-${index}`}
                        fill={BAR_COLORS[index % BAR_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nog geen aanvragen ontvangen.
            </p>
          )}
        </ChartSection>
      </div>

      {/* ── Inquiries per week (full width) ──────────────────────── */}
      {inquiriesPerWeek.length > 0 && (
        <ChartSection title="Aanvragen per week (8 weken)">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={inquiriesPerWeek}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: COLORS.muted }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: COLORS.muted }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="count"
                  name="Aanvragen"
                  fill={COLORS.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartSection>
      )}
    </div>
  )
}

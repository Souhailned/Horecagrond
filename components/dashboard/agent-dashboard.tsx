import {
  getAgencyStats,
  listInquiries,
  getTopProperties,
  type InquiryStatus,
  type InquiryPriority,
} from "@/app/actions/agency";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Eye,
  Clock,
  TrendingUp,
  TrendingDown,
  Flame,
  ThermometerSun,
  Snowflake,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Format relative time (e.g., "15 min ago", "2 hours ago", "1 day ago")
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} min geleden`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "uur" : "uur"} geleden`;
  } else {
    return `${diffDays} ${diffDays === 1 ? "dag" : "dagen"} geleden`;
  }
}

/**
 * Get status badge variant and label
 */
function getStatusConfig(status: InquiryStatus): {
  variant: "default" | "secondary" | "destructive" | "outline";
  label: string;
} {
  const configs: Record<
    InquiryStatus,
    { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
  > = {
    NEW: { variant: "default", label: "Nieuw" },
    VIEWED: { variant: "secondary", label: "Bekeken" },
    CONTACTED: { variant: "outline", label: "Contact" },
    VIEWING_SCHEDULED: { variant: "default", label: "Bezichtiging" },
    NEGOTIATING: { variant: "default", label: "Onderhandeling" },
    CLOSED_WON: { variant: "default", label: "Gewonnen" },
    CLOSED_LOST: { variant: "destructive", label: "Verloren" },
    SPAM: { variant: "destructive", label: "Spam" },
  };
  return configs[status];
}

/**
 * Get priority icon component
 */
function PriorityIcon({
  priority,
  className,
}: {
  priority: InquiryPriority;
  className?: string;
}) {
  const icons = {
    hot: <Flame className={cn("text-destructive", className)} />,
    warm: <ThermometerSun className={cn("text-chart-5", className)} />,
    cold: <Snowflake className={cn("text-chart-2", className)} />,
  };
  return icons[priority];
}

/**
 * Stat Card Component for displaying metrics
 */
function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  badge,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  trendLabel?: string;
  badge?: number;
  description?: string;
}) {
  const isPositiveTrend = trend && trend > 0;
  const isNegativeTrend = trend && trend < 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {badge !== undefined && badge > 0 && (
            <Badge variant="default" className="text-xs">
              +{badge}
            </Badge>
          )}
        </div>
        {(trend !== undefined || description) && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {trend !== undefined && (
              <>
                {isPositiveTrend && (
                  <TrendingUp className="h-3 w-3 text-chart-2" />
                )}
                {isNegativeTrend && (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    isPositiveTrend && "text-chart-2",
                    isNegativeTrend && "text-destructive"
                  )}
                >
                  {isPositiveTrend ? "+" : ""}
                  {trend.toFixed(1)}%
                </span>
              </>
            )}
            {trendLabel && (
              <span className="text-muted-foreground">{trendLabel}</span>
            )}
            {description && (
              <span className="text-muted-foreground">{description}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Agent Dashboard Component
 * Server component that displays agency statistics, recent leads, and top properties
 */
export async function AgentDashboard() {
  // Fetch all data in parallel
  const [statsResult, inquiriesResult, propertiesResult] = await Promise.all([
    getAgencyStats(),
    listInquiries(5),
    getTopProperties(5),
  ]);

  // Handle errors gracefully
  if (!statsResult.success || !inquiriesResult.success || !propertiesResult.success) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">
              Er ging iets mis
            </CardTitle>
            <CardDescription>
              {statsResult.error || inquiriesResult.error || propertiesResult.error}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = statsResult.data!;
  const inquiries = inquiriesResult.data!;
  const properties = propertiesResult.data!;

  // Calculate views comparison
  const viewsDiff = stats.viewsThisWeek.count - stats.viewsThisWeek.previousWeek;
  const viewsPercentChange =
    stats.viewsThisWeek.previousWeek > 0
      ? (viewsDiff / stats.viewsThisWeek.previousWeek) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Actieve Panden"
          value={stats.activeProperties.count}
          icon={Building2}
          trend={stats.activeProperties.trend}
          trendLabel="vs vorige maand"
        />
        <StatCard
          title="Nieuwe Leads Vandaag"
          value={stats.newLeadsToday.count}
          icon={Users}
          badge={stats.newLeadsToday.count > 0 ? stats.newLeadsToday.count : undefined}
        />
        <StatCard
          title="Views Deze Week"
          value={stats.viewsThisWeek.count.toLocaleString("nl-NL")}
          icon={Eye}
          trend={viewsPercentChange}
          trendLabel="vs vorige week"
        />
        <StatCard
          title="Gemiddelde Response"
          value={stats.averageResponseTime.formatted}
          icon={Clock}
          description="reactietijd"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Leads */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recente Leads
            </CardTitle>
            <CardDescription>
              De laatste {inquiries.length} binnenkomende aanvragen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inquiries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Geen recente leads gevonden.
              </p>
            ) : (
              <ul className="space-y-4">
                {inquiries.map((inquiry) => {
                  const statusConfig = getStatusConfig(inquiry.status);
                  return (
                    <li
                      key={inquiry.id}
                      className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <PriorityIcon
                            priority={inquiry.priority}
                            className="h-4 w-4 shrink-0"
                          />
                          <p className="truncate font-medium">
                            {inquiry.propertyName}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {inquiry.contactName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(inquiry.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={statusConfig.variant}
                        className="shrink-0"
                      >
                        {statusConfig.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top Properties */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Panden
            </CardTitle>
            <CardDescription>
              Meest bekeken panden deze week
            </CardDescription>
          </CardHeader>
          <CardContent>
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Geen panden gevonden.
              </p>
            ) : (
              <ul className="space-y-4">
                {properties.map((property, index) => (
                  <li
                    key={property.id}
                    className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {index + 1}
                      </span>
                      <p className="truncate font-medium">{property.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {property.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {property.inquiries}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AgentDashboard;

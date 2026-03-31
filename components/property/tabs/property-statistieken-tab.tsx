"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Eye,
  MessageSquare,
  Heart,
  TrendingUp,
  CalendarDays,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { getPropertyStats } from "@/app/actions/property";
import type { Property } from "@/lib/validations/property";
import { cn } from "@/lib/utils";

interface PropertyStatistiekenTabProps {
  property: Property;
}

interface StatsData {
  viewsByDay: Array<{ date: string; views: number; inquiries: number }>;
  totalViews: number;
  totalInquiries: number;
  totalSaves: number;
  conversionRate: number;
}

// Chart configuration
const chartConfig = {
  views: {
    label: "Weergaven",
    color: "hsl(var(--primary))",
  },
  inquiries: {
    label: "Aanvragen",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function PropertyStatistiekenTab({ property }: PropertyStatistiekenTabProps) {
  const [isPending, startTransition] = useTransition();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [period, setPeriod] = useState<"7" | "14" | "30">("30");
  const [chartType, setChartType] = useState<"area" | "line" | "bar">("area");

  // Fetch stats on mount and when period changes
  useEffect(() => {
    startTransition(async () => {
      const result = await getPropertyStats(property.id);
      if (result.success && result.data) {
        setStats(result.data);
      }
    });
  }, [property.id, period]);

  // Filter data by period
  const filteredData = stats?.viewsByDay.slice(-parseInt(period)) || [];

  // Calculate period stats
  const periodStats = filteredData.reduce(
    (acc, day) => ({
      views: acc.views + day.views,
      inquiries: acc.inquiries + day.inquiries,
    }),
    { views: 0, inquiries: 0 }
  );

  // Calculate trend (comparing first half to second half of period)
  const calculateTrend = (data: typeof filteredData, key: "views" | "inquiries") => {
    if (data.length < 2) return 0;
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid).reduce((sum, d) => sum + d[key], 0) / mid;
    const secondHalf = data.slice(mid).reduce((sum, d) => sum + d[key], 0) / (data.length - mid);
    if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
    return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
  };

  const viewsTrend = calculateTrend(filteredData, "views");
  const inquiriesTrend = calculateTrend(filteredData, "inquiries");

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  };

  // Stat card component
  const StatCard = ({
    title,
    value,
    trend,
    icon: Icon,
    description,
  }: {
    title: string;
    value: number | string;
    trend?: number;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {trend !== undefined && trend !== 0 && (
            <span
              className={cn(
                "flex items-center text-xs font-medium",
                trend > 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {trend > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (isPending && !stats) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Performance overzicht</h2>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-[140px]">
              <CalendarDays className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dagen</SelectItem>
              <SelectItem value="14">14 dagen</SelectItem>
              <SelectItem value="30">30 dagen</SelectItem>
            </SelectContent>
          </Select>

          <Select value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="area">Area</SelectItem>
              <SelectItem value="line">Lijn</SelectItem>
              <SelectItem value="bar">Staaf</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Weergaven"
          value={periodStats.views.toLocaleString("nl-NL")}
          trend={viewsTrend}
          icon={Eye}
          description={`Laatste ${period} dagen`}
        />
        <StatCard
          title="Aanvragen"
          value={periodStats.inquiries}
          trend={inquiriesTrend}
          icon={MessageSquare}
          description={`Laatste ${period} dagen`}
        />
        <StatCard
          title="Opgeslagen"
          value={stats?.totalSaves || property.savedCount}
          icon={Heart}
          description="Totaal"
        />
        <StatCard
          title="Conversie"
          value={`${stats?.conversionRate || 0}%`}
          icon={TrendingUp}
          description="Aanvragen / weergaven"
        />
      </div>

      {/* Main chart */}
      <Card>
        <CardHeader>
          <CardTitle>Weergaven & Aanvragen</CardTitle>
          <CardDescription>
            Dagelijkse statistieken over de afgelopen {period} dagen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            {chartType === "area" ? (
              <AreaChart data={filteredData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDate}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => formatDate(label as string)}
                    />
                  }
                />
                <defs>
                  <linearGradient id="fillViews" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-views)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-views)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillInquiries" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-inquiries)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-inquiries)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="views"
                  type="monotone"
                  fill="url(#fillViews)"
                  stroke="var(--color-views)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="inquiries"
                  type="monotone"
                  fill="url(#fillInquiries)"
                  stroke="var(--color-inquiries)"
                  strokeWidth={2}
                />
              </AreaChart>
            ) : chartType === "line" ? (
              <LineChart data={filteredData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDate}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => formatDate(label as string)}
                    />
                  }
                />
                <Line
                  dataKey="views"
                  type="monotone"
                  stroke="var(--color-views)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="inquiries"
                  type="monotone"
                  stroke="var(--color-inquiries)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            ) : (
              <BarChart data={filteredData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatDate}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => formatDate(label as string)}
                    />
                  }
                />
                <Bar
                  dataKey="views"
                  fill="var(--color-views)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="inquiries"
                  fill="var(--color-inquiries)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Additional insights */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Best performing days */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beste dagen</CardTitle>
            <CardDescription>Top 5 dagen met meeste weergaven</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...filteredData]
                .sort((a, b) => b.views - a.views)
                .slice(0, 5)
                .map((day, i) => (
                  <div key={day.date} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {i + 1}
                      </span>
                      <span className="text-sm">{formatDate(day.date)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {day.views}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {day.inquiries}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversion analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversie analyse</CardTitle>
            <CardDescription>Inzichten in bezoekers gedrag</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Totaal weergaven
                </span>
                <span className="font-medium tabular-nums">
                  {stats?.totalViews.toLocaleString("nl-NL") || property.viewCount.toLocaleString("nl-NL")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Totaal aanvragen
                </span>
                <span className="font-medium tabular-nums">
                  {stats?.totalInquiries || property.inquiryCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Opgeslagen
                </span>
                <span className="font-medium tabular-nums">
                  {stats?.totalSaves || property.savedCount}
                </span>
              </div>
              <hr />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Conversie ratio</span>
                <span className="font-bold text-primary tabular-nums">
                  {stats?.conversionRate || 0}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Weergaven naar aanvragen</span>
                  <span>{stats?.conversionRate || 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(stats?.conversionRate || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Tips */}
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                {(stats?.conversionRate || 0) < 2 ? (
                  <p>
                    <strong>Tip:</strong> Voeg meer foto&apos;s toe en zorg voor een
                    complete beschrijving om de conversie te verhogen.
                  </p>
                ) : (stats?.conversionRate || 0) < 5 ? (
                  <p>
                    <strong>Goed bezig!</strong> Je conversie is gemiddeld. Overweeg
                    om kenmerken uit te lichten om meer interesse te wekken.
                  </p>
                ) : (
                  <p>
                    <strong>Uitstekend!</strong> Je pand presteert bovengemiddeld
                    qua conversie.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

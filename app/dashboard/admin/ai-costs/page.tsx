import { requirePagePermission } from "@/lib/session";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAiCostSummary,
  getAiCostByWorkspace,
  getDailyAiCosts,
} from "@/app/actions/admin/ai-costs";
import { Cpu, TrendingUp, DollarSign } from "lucide-react";
import Link from "next/link";

function formatCents(cents: number): string {
  return `\u20AC${(cents / 100).toFixed(2)}`;
}

function BarChart({
  items,
  maxVal,
}: {
  items: Array<{ label: string; value: number; calls: number }>;
  maxVal: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground capitalize">
              {item.label.replace(/_/g, " ")}
            </span>
            <span className="font-medium">
              {formatCents(item.value)} ({item.calls}x)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width:
                  maxVal > 0 ? `${(item.value / maxVal) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Sparkline({
  data,
}: {
  data: Array<{ date: string; costCents: number }>;
}) {
  if (data.length < 2)
    return (
      <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
        Geen data
      </div>
    );

  const width = 300;
  const height = 64;
  const max = Math.max(...data.map((d) => d.costCents), 1);
  const min = 0;
  const range = max - min;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.costCents - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function AdminAiCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePagePermission("analytics:platform");

  const { days: daysStr } = await searchParams;
  const days = parseInt(daysStr || "30", 10);

  const [summaryRes, workspaceRes, dailyRes] = await Promise.all([
    getAiCostSummary(days),
    getAiCostByWorkspace(days),
    getDailyAiCosts(days),
  ]);

  const summary = summaryRes.success ? summaryRes.data : null;
  const workspaces = workspaceRes.success ? workspaceRes.data : [];
  const daily = dailyRes.success ? dailyRes.data : [];

  const kpis = [
    {
      label: "Totale kosten",
      value: summary ? formatCents(summary.totalCostCents) : "\u20AC0.00",
      icon: DollarSign,
      sub: `Afgelopen ${days} dagen`,
    },
    {
      label: "API calls",
      value: summary?.totalCalls.toLocaleString("nl-NL") || "0",
      icon: Cpu,
      sub: "Totaal verzoeken",
    },
    {
      label: "Gem. per call",
      value: summary ? formatCents(summary.avgCostPerCallCents) : "\u20AC0.00",
      icon: TrendingUp,
      sub: "Gemiddelde kosten",
    },
  ];

  const serviceMax = Math.max(
    ...(summary?.byService.map((s) => s.costCents) || [1])
  );
  const featureMax = Math.max(
    ...(summary?.byFeature.map((f) => f.costCents) || [1])
  );

  return (
    <ContentCard>
      <ContentCardHeader
        title="AI Kosten Dashboard"
        actions={
          <div className="flex items-center gap-1">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`?days=${d}`}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />
      <ContentCardBody className="p-4 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {kpi.label}
                    </span>
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {kpi.sub}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Sparkline */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Kostenoverzicht</p>
            <Sparkline data={daily} />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{daily[0]?.date || ""}</span>
              <span>{daily[daily.length - 1]?.date || ""}</span>
            </div>
          </CardContent>
        </Card>

        {/* Breakdowns */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Per service</p>
              <BarChart
                items={(summary?.byService || []).map((s) => ({
                  label: s.service,
                  value: s.costCents,
                  calls: s.calls,
                }))}
                maxVal={serviceMax}
              />
              {!summary?.byService.length && (
                <p className="text-xs text-muted-foreground">Nog geen data</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">Per feature</p>
              <BarChart
                items={(summary?.byFeature || []).map((f) => ({
                  label: f.feature,
                  value: f.costCents,
                  calls: f.calls,
                }))}
                maxVal={featureMax}
              />
              {!summary?.byFeature.length && (
                <p className="text-xs text-muted-foreground">Nog geen data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Workspace table */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Kosten per workspace</p>
            <div className="space-y-2">
              {workspaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nog geen data</p>
              ) : (
                workspaces.map((ws) => (
                  <div
                    key={ws.workspaceId || "public"}
                    className="flex items-center justify-between py-1.5 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {ws.workspaceName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ws.calls} calls
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatCents(ws.costCents)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </ContentCardBody>
    </ContentCard>
  );
}

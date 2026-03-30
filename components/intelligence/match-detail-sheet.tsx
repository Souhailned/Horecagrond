"use client";

import { useMemo } from "react";
import {
  Star,
  Phone,
  Globe,
  MapPin,
  Lightning,
  Train,
  Footprints,
  Storefront,
  SparkleIcon,
  ArrowSquareOut,
  Eye,
  ChatCircle,
  TrendUp,
  Users,
  MapTrifold,
} from "@phosphor-icons/react/dist/ssr";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchWithBusiness } from "@/app/actions/intelligence-matches";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchDetailSheetProps {
  match: MatchWithBusiness | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (matchId: string, status: string) => void;
  updatingId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string }
> = {
  new: { label: "Nieuw", dot: "bg-blue-500" },
  reviewed: { label: "Bekeken", dot: "bg-slate-400" },
  starred: { label: "Interessant", dot: "bg-amber-500" },
  contacted: { label: "Gecontacteerd", dot: "bg-emerald-500" },
  dismissed: { label: "Afgewezen", dot: "bg-red-400" },
};

const BREAKDOWN_CONFIG = [
  { key: "location", label: "Locatie", max: 30, icon: MapPin },
  { key: "concept", label: "Concept", max: 25, icon: Storefront },
  { key: "demographics", label: "Demografie", max: 20, icon: Users },
  { key: "signals", label: "Signalen", max: 15, icon: Lightning },
  { key: "surface", label: "Oppervlakte", max: 10, icon: MapTrifold },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSignals(signals: unknown): string[] {
  if (!signals) return [];
  if (Array.isArray(signals))
    return signals.filter((s) => typeof s === "string");
  if (typeof signals === "object" && signals !== null) {
    return Object.entries(signals as Record<string, unknown>)
      .filter(([, v]) => v === true || (typeof v === "number" && v > 0))
      .map(([k]) =>
        k
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (s) => s.toUpperCase())
          .trim(),
      );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Circular score gauge — SVG arc */
function ScoreGauge({ score }: { score: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(score / 100, 1);
  const offset = circumference * (1 - pct);

  const color =
    score >= 80
      ? "stroke-emerald-500"
      : score >= 50
        ? "stroke-amber-500"
        : "stroke-muted-foreground/40";

  const bgRing =
    score >= 80
      ? "bg-emerald-500/8 dark:bg-emerald-500/10"
      : score >= 50
        ? "bg-amber-500/8 dark:bg-amber-500/10"
        : "bg-muted/60";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-[100px] h-[100px] rounded-full shrink-0",
        bgRing,
      )}
    >
      <svg
        viewBox="0 0 90 90"
        className="absolute inset-0 w-full h-full -rotate-90"
      >
        {/* Track */}
        <circle
          cx="45"
          cy="45"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-border"
        />
        {/* Progress */}
        <circle
          cx="45"
          cy="45"
          r={radius}
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(color, "transition-all duration-700 ease-out")}
        />
      </svg>
      <div className="text-center z-10">
        <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
          {score}
        </span>
        <span className="block text-[10px] text-muted-foreground -mt-0.5">
          / 100
        </span>
      </div>
    </div>
  );
}

/** Score breakdown row with icon, bar, and value */
function BreakdownRow({
  icon: Icon,
  label,
  value,
  max,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2.5 group">
      <div className="flex items-center gap-2 w-28 shrink-0">
        <Icon
          className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors"
          weight="regular"
        />
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </span>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            pct >= 70
              ? "bg-emerald-500"
              : pct >= 40
                ? "bg-amber-500"
                : "bg-muted-foreground/30",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-muted-foreground w-10 text-right tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}

/** Stat card for the KPI grid */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3 hover:border-border hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border border-border/60 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" weight="regular" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString("nl-NL") : value}
        </p>
        {sub && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

/** Section label with line */
function SectionLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {Icon && (
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" weight="regular" />
      )}
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MatchDetailSheet({
  match,
  open,
  onOpenChange,
  onStatusChange,
  updatingId,
}: MatchDetailSheetProps) {
  const data = useMemo(() => {
    if (!match) return null;

    const { business } = match;
    const signals = parseSignals(business.signals);
    const breakdown = match.matchBreakdown as Record<string, number> | null;
    const demo = business.demografieData as Record<string, unknown> | null;
    const buurtNaam = (demo?.buurtNaam ?? demo?.buurt_naam) as
      | string
      | undefined;

    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${business.name} ${business.address} ${business.city}`,
    )}`;

    return { business, signals, breakdown, buurtNaam, googleMapsUrl };
  }, [match]);

  if (!match || !data) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[480px]" />
      </Sheet>
    );
  }

  const { business, signals, breakdown, buurtNaam, googleMapsUrl } = data;
  const score = match.matchScore;
  const statusCfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.new;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{business.name}</SheetTitle>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* ═══ Hero ═══ */}
          <div className="relative px-5 pt-6 pb-5 bg-gradient-to-b from-muted/40 to-background">
            <div className="flex items-start gap-4">
              <ScoreGauge score={score} />
              <div className="flex-1 min-w-0 pt-1.5">
                <h2 className="text-[17px] font-bold text-foreground leading-snug">
                  {business.name}
                </h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" weight="fill" />
                  <span className="truncate">
                    {business.city}
                    {business.address && ` · ${business.address}`}
                  </span>
                </p>

                {/* Rating inline */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {business.currentRating != null && (
                    <div className="flex items-center gap-1">
                      <Star
                        className="h-3.5 w-3.5 text-amber-500"
                        weight="fill"
                      />
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {business.currentRating}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({business.totalReviews?.toLocaleString("nl-NL") ?? 0})
                      </span>
                    </div>
                  )}
                  {business.businessType && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] capitalize border-none h-5"
                    >
                      {business.businessType.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>

                {/* Status pill */}
                <div className="mt-3">
                  <Select
                    value={match.status}
                    onValueChange={(v) => onStatusChange(match.id, v)}
                    disabled={updatingId === match.id}
                  >
                    <SelectTrigger className="w-auto h-7 text-xs gap-1.5 rounded-full border-border/60 px-3">
                      <span
                        className={cn(
                          "inline-block w-1.5 h-1.5 rounded-full",
                          statusCfg.dot,
                        )}
                      />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-block w-1.5 h-1.5 rounded-full",
                                cfg.dot,
                              )}
                            />
                            {cfg.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 space-y-5">
            {/* ═══ Quick Actions ═══ */}
            <div className="flex gap-2">
              {business.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 rounded-xl text-xs"
                  asChild
                >
                  <a href={`tel:${business.phone}`}>
                    <Phone className="h-3.5 w-3.5" weight="fill" />
                    Bellen
                  </a>
                </Button>
              )}
              {business.website && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 rounded-xl text-xs"
                  asChild
                >
                  <a
                    href={business.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="h-3.5 w-3.5" weight="fill" />
                    Website
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 rounded-xl text-xs"
                asChild
              >
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="h-3.5 w-3.5" weight="fill" />
                  Kaart
                </a>
              </Button>
            </div>

            {/* ═══ Score Breakdown ═══ */}
            {breakdown && (
              <div className="space-y-3">
                <SectionLabel icon={TrendUp}>Score Breakdown</SectionLabel>
                <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  {BREAKDOWN_CONFIG.map(({ key, label, max, icon }) => (
                    <BreakdownRow
                      key={key}
                      icon={icon}
                      label={label}
                      value={(breakdown[key] as number) ?? 0}
                      max={max}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ═══ Signals ═══ */}
            {signals.length > 0 && (
              <div className="space-y-3">
                <SectionLabel icon={Lightning}>
                  Overname Signalen ({signals.length})
                </SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {signals.map((signal) => (
                    <Badge
                      key={signal}
                      variant="outline"
                      className="text-[11px] text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 rounded-lg px-2.5 py-1"
                    >
                      <Lightning
                        className="h-3 w-3 mr-1 text-amber-500"
                        weight="fill"
                      />
                      {signal}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ Buurt & Bereikbaarheid ═══ */}
            {(business.passantenPerDag != null ||
              business.bereikbaarheidOV != null ||
              buurtNaam) && (
              <div className="space-y-3">
                <SectionLabel icon={MapTrifold}>
                  Buurt & Bereikbaarheid
                </SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {business.passantenPerDag != null && (
                    <StatCard
                      icon={Footprints}
                      label="Passanten/dag"
                      value={business.passantenPerDag}
                    />
                  )}
                  {business.bereikbaarheidOV != null && (
                    <StatCard
                      icon={Train}
                      label="OV bereikbaarheid"
                      value={String(business.bereikbaarheidOV)}
                    />
                  )}
                  {buurtNaam && (
                    <StatCard
                      icon={MapPin}
                      label="Buurt"
                      value={buurtNaam}
                    />
                  )}
                  {business.totalReviews != null && (
                    <StatCard
                      icon={Eye}
                      label="Reviews"
                      value={business.totalReviews}
                      sub="Google reviews"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ═══ AI Analyse ═══ */}
            {match.aiSummary && (
              <div className="space-y-3">
                <SectionLabel icon={ChatCircle}>AI Analyse</SectionLabel>
                <div className="relative rounded-xl border border-border/60 bg-gradient-to-br from-primary/[0.03] to-transparent p-4">
                  <div className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-md bg-primary/10">
                    <ChatCircle
                      className="h-3.5 w-3.5 text-primary"
                      weight="fill"
                    />
                  </div>
                  <p className="text-[13px] leading-relaxed text-foreground/80 pr-8">
                    {match.aiSummary}
                  </p>
                </div>
              </div>
            )}

            {/* ═══ Notes ═══ */}
            {match.notes && (
              <div className="space-y-3">
                <SectionLabel>Notities</SectionLabel>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {match.notes}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowClockwise,
  Crosshair,
  MapPin,
  Star,
  Lightning,
  Note,
  Trash,
  PencilSimple,
  ArrowSquareOut,
  Funnel,
  ClockCounterClockwise,
  Gear,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Spinner,
  Clock,
  Export,
  Globe,
  Footprints,
  Train,
  MapTrifold,
  CaretDown,
  CaretUp,
  Check,
  X,
  Info,
  ForkKnife,
  Briefcase,
  Newspaper,
  Storefront,
  Warning,
  List,
  SquaresFour,
  Rows,
} from "@phosphor-icons/react/dist/ssr";
import {
  Map,
  MapClusterLayer,
  MapPopup,
  MapControls,
} from "@/components/ui/map";
import { cn } from "@/lib/utils";
import { ScanLiveFeed } from "@/components/intelligence/scan-live-feed";
import { MatchesTable } from "@/components/intelligence/matches-table";
import { MatchesGrid } from "@/components/intelligence/matches-grid";
import { MatchDetailSheet } from "@/components/intelligence/match-detail-sheet";
import { updateMatchStatus } from "@/app/actions/intelligence-matches";
import { exportMatchesCSV } from "@/app/actions/intelligence-matches";
import { startScan } from "@/app/actions/intelligence-scan";
import { deleteIntelligenceProfile } from "@/app/actions/intelligence";
import type { MatchWithBusiness } from "@/app/actions/intelligence-matches";
import type {
  IntelligenceProfile,
  IntelligenceScanJob,
  MonitoredBusiness,
} from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileWithStats = IntelligenceProfile & {
  _count: { matches: number; scanJobs: number };
  recentMatches: number;
};

interface ProfileDetailContentProps {
  profile: ProfileWithStats;
  matches: MatchWithBusiness[];
  totalMatches: number;
  scanJobs: IntelligenceScanJob[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATCH_STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  reviewed: "Bekeken",
  starred: "Interessant",
  contacted: "Gecontacteerd",
  dismissed: "Afgewezen",
};

const MATCH_STATUS_OPTIONS = Object.entries(MATCH_STATUS_LABELS);

const SORT_OPTIONS = [
  { value: "score", label: "Hoogste score" },
  { value: "date", label: "Nieuwste" },
  { value: "signals", label: "Meeste signalen" },
] as const;

const SCAN_STATUS_LABELS: Record<string, string> = {
  pending: "In wachtrij",
  running: "Bezig",
  completed: "Voltooid",
  failed: "Mislukt",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | null): string {
  if (!date) return "Onbekend";
  return new Date(date).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "Onbekend";
  return new Date(date).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseSignals(signals: unknown): string[] {
  if (!signals) return [];
  if (Array.isArray(signals)) return signals.filter((s) => typeof s === "string");
  if (typeof signals === "object" && signals !== null) {
    // Could be { ratingDrop: true, recentlyClosed: false, ... }
    return Object.entries(signals as Record<string, unknown>)
      .filter(([, v]) => v === true || (typeof v === "number" && v > 0))
      .map(([k]) => formatSignalLabel(k));
  }
  return [];
}

function formatSignalLabel(key: string): string {
  const labels: Record<string, string> = {
    ratingDrop: "Rating daling",
    recentlyClosed: "Recent gesloten",
    reviewDecline: "Reviews afname",
    ownerChange: "Eigenaar wijziging",
    lowRating: "Lage rating",
    highTurnover: "Hoge omzet",
    newCompetitor: "Nieuwe concurrent",
    priceChange: "Prijswijziging",
    closingSoon: "Sluiting aangekondigd",
    financialStress: "Financiele stress",
    locationPrime: "A-locatie",
    highFootTraffic: "Veel passanten",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").trim();
}

function getSignalColor(signal: string): string {
  const redSignals = [
    "Rating daling",
    "Recent gesloten",
    "Lage rating",
    "Financiele stress",
    "Sluiting aangekondigd",
  ];
  const greenSignals = ["A-locatie", "Veel passanten", "Hoge omzet"];

  if (redSignals.includes(signal)) {
    return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
  }
  if (greenSignals.includes(signal)) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
}

function renderStars(rating: number | null) {
  if (rating === null || rating === undefined) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < full
              ? "text-amber-500"
              : i === full && half
                ? "text-amber-500/50"
                : "text-muted-foreground/30",
          )}
          weight={i < full || (i === full && half) ? "fill" : "regular"}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-foreground">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function generateMatchExplanation(
  breakdown: Record<string, number> | null,
  business: MonitoredBusiness,
): string {
  if (!breakdown) return "";
  const parts: string[] = [];

  // Location
  if (breakdown.location >= 25) parts.push(`toplocatie in ${business.city}`);
  else if (breakdown.location >= 15) parts.push(`goede locatie in ${business.city}`);
  else if (breakdown.location >= 5) parts.push("matige locatie");

  // Concept
  if (breakdown.concept >= 20) parts.push("directe concept-match");
  else if (breakdown.concept >= 15) parts.push("verwant concept");
  else if (breakdown.concept >= 8) parts.push("omzetbare locatie");

  // Demographics with data
  if (breakdown.demographics >= 15) parts.push("ideale doelgroep");
  else if (breakdown.demographics > 0) parts.push("redelijke demografische fit");

  // Signals — be specific
  if (breakdown.signals >= 12) parts.push("sterke overname-signalen");
  else if (breakdown.signals >= 8) parts.push("matige overname-signalen");

  // Surface
  if (breakdown.surface >= 8) parts.push("passende oppervlakte");
  else if (breakdown.surface > 0 && breakdown.surface < 5) parts.push("oppervlakte onbekend");

  // Rating context
  if (business.currentRating != null) {
    if (business.currentRating >= 4.0) parts.push(`hoge rating (${business.currentRating})`);
    else if (business.currentRating < 3.5) parts.push(`lage rating (${business.currentRating}) — kans!`);
  }

  return parts.length > 0 ? parts.join(", ") + "." : "";
}

function getScoreDetailText(
  key: string,
  val: number,
  max: number,
  business: MonitoredBusiness,
  profile: ProfileWithStats,
): string {
  const demo = business.demografieData as Record<string, unknown> | null;

  switch (key) {
    case "location": {
      const locParts: string[] = [];
      if (business.city) locParts.push(business.city);
      if (business.passantenPerDag)
        locParts.push(`~${business.passantenPerDag.toLocaleString("nl-NL")} passanten/dag`);
      if (business.bereikbaarheidOV) locParts.push(`OV: ${business.bereikbaarheidOV}`);
      return locParts.length > 0
        ? `${locParts.join(" \u2022 ")} (${val}/${max})`
        : `Score ${val}/${max}`;
    }
    case "concept": {
      if (val >= 20) return `Directe match met '${profile.concept}' (${val}/${max})`;
      if (val >= 15) return `Verwant concept — ${profile.concept} (${val}/${max})`;
      if (val >= 8) return `Indirect gerelateerd (${val}/${max})`;
      return `Geen sterk conceptverband (${val}/${max})`;
    }
    case "demographics": {
      if (!demo) return `Geen demografische data beschikbaar (${val}/${max})`;
      const demoParts: string[] = [];
      const jongerenPct = demo.jongerenPercentage as number | undefined;
      const gemInkomen = demo.gemiddeldInkomen as number | undefined;
      if (jongerenPct != null) demoParts.push(`Jongeren: ${Math.round(jongerenPct)}%`);
      if (gemInkomen != null) demoParts.push(`Inkomen: \u20AC${Math.round(gemInkomen / 1000)}k`);
      return demoParts.length > 0
        ? `${demoParts.join(" \u2022 ")} (${val}/${max})`
        : `Demografische score (${val}/${max})`;
    }
    case "signals": {
      const signalScore = business.signalScore;
      if (signalScore > 0)
        return `Signaalscore: ${signalScore}/100 \u2192 ${val}/${max} punten`;
      return `Geen signalen gedetecteerd (${val}/${max})`;
    }
    case "surface": {
      if (val >= 8) return `Past binnen ${profile.minSurface ?? "?"}-${profile.maxSurface ?? "?"}m\u00B2 (${val}/${max})`;
      if (val > 0 && val < 5) return `Geen oppervlaktedata beschikbaar (${val}/${max})`;
      return `Oppervlakte score (${val}/${max})`;
    }
    default:
      return `${val}/${max}`;
  }
}

// Netherlands map center
const NL_CENTER: [number, number] = [5.2913, 52.1326];

// ---------------------------------------------------------------------------
// Profile Summary Bar
// ---------------------------------------------------------------------------

function ProfileSummary({ profile }: { profile: ProfileWithStats }) {
  const cities = profile.targetCities.slice(0, 5).join(", ");
  const hasMore = profile.targetCities.length > 5;

  return (
    <div className="rounded-xl border border-border bg-muted/50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shrink-0">
          <Crosshair className="h-5 w-5" weight="regular" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[15px] font-semibold text-foreground leading-6 truncate">
              {profile.name}
            </p>
            {profile.active ? (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                Actief
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                Gepauzeerd
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            <span className="font-medium text-foreground">{profile.concept}</span>
            {cities && (
              <>
                <span className="mx-1.5 text-border">|</span>
                <MapPin
                  className="inline h-3 w-3 text-muted-foreground mr-0.5"
                  weight="regular"
                />
                {cities}
                {hasMore && ` +${profile.targetCities.length - 5}`}
              </>
            )}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {profile._count.matches}
              </span>{" "}
              matches totaal
            </span>
            <span>
              <span className="font-medium text-foreground">
                {profile.recentMatches}
              </span>{" "}
              deze week
            </span>
            <span>
              Laatste scan: {formatDate(profile.lastScanAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crawled Intel Row (inline on match cards)
// ---------------------------------------------------------------------------

type CrawledIntelData = NonNullable<MatchWithBusiness["business"]["crawledIntel"]>;

function CrawledIntelRow({ intel }: { intel: CrawledIntelData }) {
  const tb = intel.thuisbezorgdData as Record<string, unknown> | null;
  const kvk = intel.kvkData as Record<string, unknown> | null;
  const news = intel.newsData as Record<string, unknown> | null;
  const comp = intel.competitorsData as Record<string, unknown> | null;
  const ta = intel.tripadvisorData as Record<string, unknown> | null;

  // Thuisbezorgd
  const tbRating = typeof tb?.rating === "number" ? tb.rating : null;

  // KvK
  const kvkEigenaar = typeof kvk?.eigenaar === "string" ? kvk.eigenaar : null;
  const kvkKeten = kvk?.isKeten === true;
  const ketenGrootte = typeof kvk?.ketenGrootte === "number" ? kvk.ketenGrootte : null;

  // TripAdvisor (from crawled intel, richer than MonitoredBusiness fields)
  const taRating = typeof ta?.rating === "number" ? ta.rating : null;
  const taRanking = typeof ta?.ranking === "string" ? ta.ranking : null;

  // News signals
  const newsOvername = news?.hasOvernameSignal === true;
  const newsFaillissement = news?.hasFaillissementSignal === true;

  // Competitors
  const compCount = Array.isArray(comp?.competitors) ? (comp.competitors as unknown[]).length : 0;

  const hasData =
    tbRating != null ||
    kvkEigenaar != null ||
    taRating != null ||
    newsOvername ||
    newsFaillissement ||
    compCount > 0;

  if (!hasData) return null;

  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      {tbRating != null && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          <ForkKnife className="h-3 w-3" weight="regular" />
          Thuisbezorgd {tbRating.toFixed(1)}/10
        </span>
      )}
      {taRating != null && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Star className="h-3 w-3" weight="fill" />
          TripAdvisor {taRating.toFixed(1)}
          {taRanking ? ` (${taRanking})` : ""}
        </span>
      )}
      {kvkEigenaar && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          <Briefcase className="h-3 w-3" weight="regular" />
          {kvkEigenaar}
          {kvkKeten && ketenGrootte != null
            ? ` (keten, ${ketenGrootte} vestigingen)`
            : kvkKeten
              ? " (keten)"
              : ""}
        </span>
      )}
      {newsOvername && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 font-medium">
          <Newspaper className="h-3 w-3" weight="bold" />
          Overname signaal
        </span>
      )}
      {newsFaillissement && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 font-medium">
          <Warning className="h-3 w-3" weight="bold" />
          Faillissement signaal
        </span>
      )}
      {compCount > 0 && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          <Storefront className="h-3 w-3" weight="regular" />
          {compCount} concurrent{compCount !== 1 ? "en" : ""} nabij
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Card
// ---------------------------------------------------------------------------

interface MatchCardProps {
  match: MatchWithBusiness;
  profile: ProfileWithStats;
  onStatusChange: (matchId: string, status: string) => void;
  onOpenNotes: (match: MatchWithBusiness) => void;
  updatingId: string | null;
}

function MatchCard({ match, profile, onStatusChange, onOpenNotes, updatingId }: MatchCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { business } = match;
  const score = match.matchScore;
  const signals = parseSignals(business.signals);
  const breakdown = match.matchBreakdown as Record<string, number> | null;
  const demo = business.demografieData as Record<string, unknown> | null;
  const buurtNaam = demo?.buurtNaam as string | undefined;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${business.name} ${business.address} ${business.city}`,
  )}`;

  return (
    <div className="rounded-2xl border border-border bg-background p-4 space-y-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Row 1: Score + Business info + Contact */}
      <div className="flex items-start gap-3">
        {/* Score badge with label */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className={cn(
              "flex items-center justify-center rounded-xl w-12 h-12 text-lg font-bold transition-shadow duration-300",
              score >= 80
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 ring-2 ring-emerald-400/30 dark:ring-emerald-400/20"
                : score >= 50
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {score}
          </div>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>

        {/* Business info */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-foreground truncate">
            {business.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {business.city}
            {business.address && ` \u2022 ${business.address}`}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {business.currentRating != null && (
              <span className="flex items-center gap-1">
                {renderStars(business.currentRating)}
                <span className="text-xs text-muted-foreground">
                  {business.currentRating} ({business.totalReviews ?? 0})
                </span>
              </span>
            )}
            {business.businessType && (
              <Badge variant="secondary" className="text-[10px] border-none capitalize">
                {business.businessType.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>

        {/* Contact info (RIGHT side) */}
        <div className="flex flex-col gap-1 shrink-0 text-right">
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              title="Bel direct"
            >
              <span className="font-mono">{business.phone}</span>
            </a>
          )}
          {business.website && (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-primary truncate max-w-[180px]"
              title={business.website}
            >
              {business.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </div>

      {/* Row 2: Score breakdown (mini bars) + expandable details */}
      {breakdown && (() => {
        const scoreComponents = [
          { key: "location", label: "Locatie", max: 30 },
          { key: "concept", label: "Concept", max: 25 },
          { key: "demographics", label: "Buurt", max: 20 },
          { key: "signals", label: "Signalen", max: 15 },
          { key: "surface", label: "Opp.", max: 10 },
        ] as const;

        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-medium">Score:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {scoreComponents.map(({ key, label, max }) => {
                  const val = breakdown[key] ?? 0;
                  const pct = Math.round((val / max) * 100);
                  return (
                    <span key={key} className="flex items-center gap-0.5" title={`${label}: ${val}/${max}`}>
                      <span>{label}</span>
                      <span className="w-8 h-1.5 rounded-full bg-muted overflow-hidden inline-block">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-muted-foreground/30",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-3 w-3" weight="regular" />
                <span className="hidden sm:inline">Details</span>
                {showDetails ? (
                  <CaretUp className="h-3 w-3" weight="bold" />
                ) : (
                  <CaretDown className="h-3 w-3" weight="bold" />
                )}
              </button>
            </div>

            {/* Expandable score detail section */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5 text-[11px]">
                    {scoreComponents.map(({ key, label, max }) => {
                      const val = breakdown[key] ?? 0;
                      const pct = Math.round((val / max) * 100);
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 font-medium text-muted-foreground">{label}</span>
                          <span className="w-10 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-muted-foreground/30",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="flex-1 text-muted-foreground">
                            {getScoreDetailText(key, val, max, business, profile)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })()}

      {/* Row 2.5: Profile requirements check */}
      {(profile.minPassanten || profile.minSurface || profile.maxSurface) && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {profile.minPassanten != null && (
            <span className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
              business.passantenPerDag != null && business.passantenPerDag >= profile.minPassanten
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
            )}>
              {business.passantenPerDag != null && business.passantenPerDag >= profile.minPassanten ? (
                <Check className="h-2.5 w-2.5" weight="bold" />
              ) : (
                <X className="h-2.5 w-2.5" weight="bold" />
              )}
              Min. {profile.minPassanten.toLocaleString("nl-NL")} passanten
            </span>
          )}
          {(profile.minSurface != null || profile.maxSurface != null) && (
            <span className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
              breakdown && breakdown.surface >= 8
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : breakdown && breakdown.surface < 5
                  ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
            )}>
              {breakdown && breakdown.surface >= 8 ? (
                <Check className="h-2.5 w-2.5" weight="bold" />
              ) : breakdown && breakdown.surface < 5 ? (
                <X className="h-2.5 w-2.5" weight="bold" />
              ) : (
                <Info className="h-2.5 w-2.5" weight="regular" />
              )}
              {profile.minSurface ?? "?"}-{profile.maxSurface ?? "?"}m{"\u00B2"}
            </span>
          )}
          {!profile.includeChains && business.chainName && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Info className="h-2.5 w-2.5" weight="regular" />
              Keten: {business.chainName}
            </span>
          )}
          {profile.locationTypes.length > 0 && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Info className="h-2.5 w-2.5" weight="regular" />
              {profile.locationTypes.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Row 3: Buurt context */}
      {(business.passantenPerDag || business.bereikbaarheidOV || buurtNaam) && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {business.passantenPerDag && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Footprints className="h-3 w-3" weight="regular" />
              ~{business.passantenPerDag.toLocaleString()} passanten/dag
            </span>
          )}
          {business.bereikbaarheidOV && (
            <span
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full",
                business.bereikbaarheidOV === "uitstekend"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : business.bereikbaarheidOV === "goed"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <Train className="h-3 w-3" weight="regular" />
              OV: {business.bereikbaarheidOV}
            </span>
          )}
          {buurtNaam && (
            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {buurtNaam}
            </span>
          )}
        </div>
      )}

      {/* Row 4: Signal badges */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((signal) => (
            <Badge
              key={signal}
              variant="secondary"
              className={cn("text-[11px] border-none", getSignalColor(signal))}
            >
              {formatSignalLabel(signal)}
            </Badge>
          ))}
        </div>
      )}

      {/* Row 4.25: Crawled intelligence highlights */}
      {business.crawledIntel && business.crawledIntel.crawlStatus !== "failed" && (
        <CrawledIntelRow intel={business.crawledIntel} />
      )}

      {/* Row 4.5: Available intelligence sources */}
      {(business.website || business.chainName || (business.totalReviews != null && business.totalReviews > 50)) && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="font-medium">Bronnen:</span>
          {business.website && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
              Website
            </Badge>
          )}
          {business.chainName && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
              Keten: {business.chainName}
              {business.chainSize != null && ` (${business.chainSize})`}
            </Badge>
          )}
          {business.totalReviews != null && business.totalReviews > 50 && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
              {business.totalReviews} reviews
            </Badge>
          )}
          {business.tripadvisorRating != null && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
              TripAdvisor {business.tripadvisorRating}
            </Badge>
          )}
        </div>
      )}

      {/* Row 5: AI summary / "Waarom deze match?" */}
      {match.aiSummary ? (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {match.aiSummary}
        </p>
      ) : (() => {
        const explanation = generateMatchExplanation(breakdown, business);
        return explanation ? (
          <p className="text-xs text-muted-foreground italic">
            <span className="font-medium text-foreground/70 not-italic">
              Waarom deze match?
            </span>{" "}
            {explanation}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">
            AI analyse beschikbaar na diep onderzoek
          </p>
        );
      })()}

      {/* Row 6: Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <Select
          value={match.status}
          onValueChange={(value) => onStatusChange(match.id, value)}
          disabled={updatingId === match.id}
        >
          <SelectTrigger size="sm" className="h-7 text-xs w-auto min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_STATUS_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          {business.phone && (
            <a href={`tel:${business.phone}`} title="Bellen">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <span>Bel</span>
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onOpenNotes(match)}
            title="Notities"
          >
            <Note className="h-4 w-4" weight="regular" />
          </Button>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" title="Google Maps">
            <Button variant="ghost" size="icon" className="size-7">
              <ArrowSquareOut className="h-4 w-4" weight="regular" />
            </Button>
          </a>
          {business.website && (
            <a href={business.website} target="_blank" rel="noopener noreferrer" title="Website">
              <Button variant="ghost" size="icon" className="size-7">
                <Globe className="h-4 w-4" weight="regular" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Match List Empty State
// ---------------------------------------------------------------------------

function MatchesEmptyState() {
  return (
    <div className="flex h-60 flex-col items-center justify-center text-center">
      <div className="p-3 bg-muted rounded-md mb-4">
        <MagnifyingGlass className="h-6 w-6 text-foreground" weight="regular" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Nog geen matches
      </h3>
      <p className="mb-6 text-sm text-muted-foreground max-w-sm">
        Start een scan om bedrijven te vinden die aan je zoekprofiel voldoen.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intelligence Map
// ---------------------------------------------------------------------------

function IntelligenceMap({ matches }: { matches: MatchWithBusiness[] }) {
  const [selectedMatch, setSelectedMatch] = useState<MatchWithBusiness | null>(
    null,
  );
  const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);

  // Filter matches that have coordinates
  const mappableMatches = useMemo(
    () => matches.filter((m) => m.business.lat != null && m.business.lng != null),
    [matches],
  );

  // Convert matches to GeoJSON for clustering
  const geoJsonData = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, { match: string }>
  >(
    () => ({
      type: "FeatureCollection",
      features: mappableMatches.map((m) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [m.business.lng, m.business.lat],
        },
        properties: {
          match: JSON.stringify({
            id: m.id,
            score: m.matchScore,
            status: m.status,
            businessName: m.business.name,
            businessCity: m.business.city,
            businessAddress: m.business.address,
            businessPhone: m.business.phone,
            businessWebsite: m.business.website,
            businessRating: m.business.currentRating,
          }),
        },
      })),
    }),
    [mappableMatches],
  );

  // Calculate center from matches, or fallback to Netherlands center
  const center = useMemo<[number, number]>(() => {
    if (mappableMatches.length === 0) return NL_CENTER;
    const avgLng =
      mappableMatches.reduce((sum, m) => sum + m.business.lng, 0) /
      mappableMatches.length;
    const avgLat =
      mappableMatches.reduce((sum, m) => sum + m.business.lat, 0) /
      mappableMatches.length;
    return [avgLng, avgLat];
  }, [mappableMatches]);

  if (mappableMatches.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center text-center">
        <div className="p-3 bg-muted rounded-md mb-4">
          <MapTrifold className="h-6 w-6 text-foreground" weight="regular" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Geen locatiegegevens
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Er zijn nog geen matches met bekende coordinaten om op de kaart te
          tonen.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl" role="region" aria-label={`Kaart met ${mappableMatches.length} matches`}>
      <Map
        center={center}
        zoom={mappableMatches.length === 1 ? 13 : 8}
        styles={{
          light: "https://tiles.openfreemap.org/styles/liberty",
          dark: "https://tiles.openfreemap.org/styles/dark",
        }}
        className="h-[500px] w-full rounded-xl"
      >
        <MapControls showZoom showLocate position="bottom-right" />

        <MapClusterLayer
          data={geoJsonData}
          clusterMaxZoom={14}
          clusterRadius={50}
          clusterColors={["#22c55e", "#f59e0b", "#9ca3af"]}
          clusterThresholds={[10, 30]}
          pointColor="#22c55e"
          onPointClick={(feature, coordinates) => {
            const matchData =
              typeof feature.properties.match === "string"
                ? JSON.parse(feature.properties.match)
                : feature.properties.match;
            // Find the full match object
            const fullMatch = matches.find((m) => m.id === matchData.id);
            if (fullMatch) {
              setSelectedMatch(fullMatch);
              setPopupCoords(coordinates);
            }
          }}
        />

        {selectedMatch && popupCoords && (
          <MapPopup
            longitude={popupCoords[0]}
            latitude={popupCoords[1]}
            closeButton
            onClose={() => {
              setSelectedMatch(null);
              setPopupCoords(null);
            }}
          >
            <MatchPopupCard match={selectedMatch} />
          </MapPopup>
        )}
      </Map>

      {/* Match count overlay */}
      <div className="absolute left-3 top-3 z-10 rounded-lg border border-border/50 bg-background/90 px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm">
        {mappableMatches.length}{" "}
        {mappableMatches.length === 1 ? "match" : "matches"}
      </div>

      {/* Legend */}
      <div className="absolute right-3 bottom-12 z-10 rounded-lg border border-border/50 bg-background/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Score 60+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Score 40-59</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Score &lt;40</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Popup Card (for map)
// ---------------------------------------------------------------------------

function MatchPopupCard({ match }: { match: MatchWithBusiness }) {
  const { business } = match;
  const score = match.matchScore;

  return (
    <div className="w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "flex items-center justify-center rounded-lg w-9 h-9 text-sm font-bold shrink-0",
              score >= 60
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                : score >= 40
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {score}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {business.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {business.city}
              {business.address && ` \u2022 ${business.address}`}
            </p>
          </div>
        </div>

        {business.currentRating != null && (
          <div className="flex items-center gap-1">
            {renderStars(business.currentRating)}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="text-[11px] text-primary hover:underline font-mono"
            >
              {business.phone}
            </a>
          )}
          {business.website && (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
            >
              <Globe className="h-3 w-3" weight="regular" />
              Website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes Dialog
// ---------------------------------------------------------------------------

interface NotesDialogProps {
  match: MatchWithBusiness | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (matchId: string, notes: string) => void;
  saving: boolean;
}

function NotesDialog({ match, open, onOpenChange, onSave, saving }: NotesDialogProps) {
  const [notes, setNotes] = useState("");

  // Sync notes when match changes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && match) {
        setNotes(match.notes ?? "");
      }
      onOpenChange(nextOpen);
    },
    [match, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notities</DialogTitle>
          <DialogDescription>
            {match?.business.name ?? "Bedrijf"} &mdash; {match?.business.city ?? ""}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Voeg je notities toe..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          className="resize-none"
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            size="sm"
            onClick={() => match && onSave(match.id, notes)}
            disabled={saving}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Signals Tab Content
// ---------------------------------------------------------------------------

function SignalsTab({ matches }: { matches: MatchWithBusiness[] }) {
  // Group all signals across matches
  const signalGroups = useMemo(() => {
    const groups: Record<string, { count: number; businesses: string[] }> = {};

    for (const match of matches) {
      const signals = parseSignals(match.business.signals);
      for (const signal of signals) {
        if (!groups[signal]) {
          groups[signal] = { count: 0, businesses: [] };
        }
        groups[signal].count += 1;
        if (groups[signal].businesses.length < 5) {
          groups[signal].businesses.push(match.business.name);
        }
      }
    }

    return Object.entries(groups).sort(([, a], [, b]) => b.count - a.count);
  }, [matches]);

  if (signalGroups.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center text-center">
        <div className="p-3 bg-muted rounded-md mb-4">
          <Lightning className="h-6 w-6 text-foreground" weight="regular" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Nog geen signalen
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Signalen verschijnen zodra er matches met opvallende veranderingen zijn.
        </p>
      </div>
    );
  }

  // Quick summary
  const totalSignals = signalGroups.reduce((sum, [, g]) => sum + g.count, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{totalSignals}</span> signalen gedetecteerd
          bij <span className="font-semibold">{matches.length}</span> bedrijven
        </p>
      </div>

      {/* Signal groups */}
      <div className="space-y-3">
        {signalGroups.map(([signal, data]) => (
          <div
            key={signal}
            className="rounded-xl border border-border bg-background px-4 py-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn("text-[11px] border-none", getSignalColor(signal))}
                >
                  {signal}
                </Badge>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {data.count} {data.count === 1 ? "zaak" : "zaken"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.businesses.join(", ")}
              {data.count > data.businesses.length &&
                ` en ${data.count - data.businesses.length} meer`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan History Tab
// ---------------------------------------------------------------------------

interface ScanHistoryTabProps {
  scanJobs: IntelligenceScanJob[];
  onStartScan: () => void;
  scanning: boolean;
}

function ScanHistoryTab({ scanJobs, onStartScan, scanning }: ScanHistoryTabProps) {
  function getScanStatusIcon(status: string) {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" weight="fill" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" weight="fill" />;
      case "running":
        return <Spinner className="h-4 w-4 text-primary animate-spin" weight="bold" />;
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" weight="regular" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" weight="regular" />;
    }
  }

  if (scanJobs.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center text-center">
        <div className="p-3 bg-muted rounded-md mb-4">
          <ClockCounterClockwise className="h-6 w-6 text-foreground" weight="regular" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Geen scan historie
        </h3>
        <p className="mb-6 text-sm text-muted-foreground max-w-sm">
          Start je eerste scan om de markt te analyseren.
        </p>
        <Button size="sm" variant="ghost" onClick={onStartScan} disabled={scanning}>
          <ArrowClockwise
            className={cn("h-4 w-4 mr-1.5", scanning && "animate-spin")}
            weight="bold"
          />
          Start nieuwe scan
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Scan historie</h3>
        <Button size="sm" variant="ghost" onClick={onStartScan} disabled={scanning}>
          <ArrowClockwise
            className={cn("h-4 w-4 mr-1.5", scanning && "animate-spin")}
            weight="bold"
          />
          Nieuwe scan
        </Button>
      </div>

      <div className="space-y-2">
        {scanJobs.map((job) => (
          <div
            key={job.id}
            className="rounded-xl border border-border bg-background px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {getScanStatusIcon(job.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {SCAN_STATUS_LABELS[job.status] ?? job.status}
                  </p>
                  {job.city && (
                    <Badge variant="secondary" className="text-[11px]">
                      {job.city}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(job.createdAt)}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                {job.status === "completed" && (
                  <>
                    <p>
                      <span className="font-medium text-foreground">
                        {job.businessesFound}
                      </span>{" "}
                      gescand
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        {job.matchesFound}
                      </span>{" "}
                      matches
                    </p>
                  </>
                )}
                {job.status === "running" && (
                  <p className="text-primary font-medium">{job.progress}%</p>
                )}
                {job.status === "failed" && job.error && (
                  <p className="text-destructive max-w-[180px] truncate">
                    {job.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

interface SettingsTabProps {
  profile: ProfileWithStats;
  onDelete: () => void;
  deleting: boolean;
}

function SettingsTab({ profile, onDelete, deleting }: SettingsTabProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-6">
      {/* Profile summary */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Profiel instellingen</h3>

        <div className="rounded-xl border border-border bg-background divide-y divide-border">
          <SettingRow label="Profielnaam" value={profile.name} />
          <SettingRow label="Concept" value={profile.concept} />
          {profile.conceptDescription && (
            <SettingRow label="Beschrijving" value={profile.conceptDescription} />
          )}
          <SettingRow label="Steden" value={profile.targetCities.join(", ")} />
          {(profile.minSurface || profile.maxSurface) && (
            <SettingRow
              label="Oppervlakte"
              value={`${profile.minSurface ?? "?"} - ${profile.maxSurface ?? "?"} m\u00B2`}
            />
          )}
          {profile.locationTypes.length > 0 && (
            <SettingRow
              label="Locatietypes"
              value={profile.locationTypes.join(", ")}
            />
          )}
          <SettingRow
            label="Keywords"
            value={profile.competitorKeywords.join(", ")}
          />
          {profile.targetAge && (
            <SettingRow label="Doelgroep leeftijd" value={profile.targetAge} />
          )}
          <SettingRow
            label="Ketens opnemen"
            value={profile.includeChains ? "Ja" : "Nee"}
          />
          <SettingRow label="Status" value={profile.active ? "Actief" : "Gepauzeerd"} />
          <SettingRow label="Aangemaakt" value={formatDate(profile.createdAt)} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/intelligence/${profile.id}/bewerken`}>
          <Button variant="ghost" size="sm">
            <PencilSimple className="h-4 w-4 mr-1.5" weight="regular" />
            Bewerken
          </Button>
        </Link>

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive font-medium">
              Weet je het zeker?
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? "Verwijderen..." : "Ja, verwijder"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Annuleren
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash className="h-4 w-4 mr-1.5" weight="regular" />
            Verwijderen
          </Button>
        )}
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="text-xs font-medium text-muted-foreground w-36 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProfileDetailContent({
  profile,
  matches: initialMatches,
  totalMatches,
  scanJobs,
}: ProfileDetailContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Matches state
  const [matches] = useState(initialMatches);
  const [sortBy, setSortBy] = useState<string>("score");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);

  // UI state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanningState, setScanningState] = useState(false);
  const [activeScanJobId, setActiveScanJobId] = useState<string | null>(() => {
    // Check if there's an active scan job — but only if it's recent (< 5 min)
    // A "running" job older than 5 minutes without Trigger.dev is likely stale
    const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    const active = scanJobs.find((j) => {
      if (j.status !== "pending" && j.status !== "running") return false;
      const jobAge = now - new Date(j.createdAt).getTime();
      return jobAge < MAX_AGE_MS;
    });
    return active?.id ?? null;
  });
  const [deletingState, setDeletingState] = useState(false);
  const [notesMatch, setNotesMatch] = useState<MatchWithBusiness | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards" | "grid">("table");
  const [selectedMatch, setSelectedMatch] = useState<MatchWithBusiness | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Computed: unique cities from matches
  const uniqueCities = useMemo(() => {
    const cities = new Set(matches.map((m) => m.business.city));
    return Array.from(cities).sort();
  }, [matches]);

  // Filtered and sorted matches
  const filteredMatches = useMemo(() => {
    let result = [...matches];

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
    }

    // City filter
    if (cityFilter !== "all") {
      result = result.filter((m) => m.business.city === cityFilter);
    }

    // Min score filter
    if (minScore > 0) {
      result = result.filter((m) => m.matchScore >= minScore);
    }

    // Sort
    switch (sortBy) {
      case "date":
        result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "signals":
        result.sort(
          (a, b) => b.business.signalScore - a.business.signalScore,
        );
        break;
      default:
        result.sort((a, b) => b.matchScore - a.matchScore);
    }

    return result;
  }, [matches, sortBy, statusFilter, cityFilter, minScore]);

  // Handlers
  async function handleStatusChange(matchId: string, status: string) {
    setUpdatingId(matchId);
    try {
      const result = await updateMatchStatus(matchId, status);
      if (result.success) {
        toast.success("Status bijgewerkt");
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error("Fout", { description: result.error });
      }
    } catch {
      toast.error("Er ging iets mis");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSaveNotes(matchId: string, notes: string) {
    setSavingNotes(true);
    try {
      const result = await updateMatchStatus(matchId, notesMatch?.status ?? "reviewed", notes);
      if (result.success) {
        toast.success("Notities opgeslagen");
        setNotesOpen(false);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error("Fout", { description: result.error });
      }
    } catch {
      toast.error("Er ging iets mis");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleStartScan() {
    setScanningState(true);
    try {
      const result = await startScan(profile.id);
      if (result.success) {
        setActiveScanJobId(result.data.jobId);
        toast.success("Scan gestart");
      } else {
        toast.error("Scan mislukt", { description: result.error });
      }
    } catch {
      toast.error("Kon scan niet starten");
    } finally {
      setScanningState(false);
    }
  }

  function handleScanComplete() {
    setActiveScanJobId(null);
    // Soft refresh to get fresh data from server (works for both completed and failed scans)
    router.refresh();
  }

  async function handleDelete() {
    setDeletingState(true);
    try {
      const result = await deleteIntelligenceProfile(profile.id);
      if (result.success) {
        toast.success("Profiel verwijderd");
        router.push("/dashboard/intelligence");
      } else {
        toast.error("Fout", { description: result.error });
      }
    } catch {
      toast.error("Er ging iets mis");
    } finally {
      setDeletingState(false);
    }
  }

  async function handleExport() {
    try {
      const result = await exportMatchesCSV(profile.id);
      if (result.success) {
        const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${profile.name.replace(/\s+/g, "-").toLowerCase()}-matches.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Export gedownload");
      } else {
        toast.error("Export mislukt", { description: result.error });
      }
    } catch {
      toast.error("Er ging iets mis bij het exporteren");
    }
  }

  const hasActiveFilters =
    statusFilter !== "all" || cityFilter !== "all" || minScore > 0;

  return (
    <>
      <ContentCard>
        <ContentCardHeader
          title={profile.name}
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleExport}
              >
                <Export className="h-3.5 w-3.5 mr-1" weight="bold" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleStartScan}
                disabled={scanningState}
              >
                <ArrowClockwise
                  className={cn(
                    "h-3.5 w-3.5 mr-1",
                    scanningState && "animate-spin",
                  )}
                  weight="bold"
                />
                Scan
              </Button>
              <Link href="/dashboard/intelligence">
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" weight="bold" />
                  Terug
                </Button>
              </Link>
            </div>
          }
        />

        <ContentCardBody className="p-4 space-y-4">
          {/* Profile summary */}
          <ProfileSummary profile={profile} />

          {/* Active Scan Animation */}
          {activeScanJobId && (
            <div className="mb-6">
              <ScanLiveFeed
                jobId={activeScanJobId}
                onComplete={handleScanComplete}
              />
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="matches" className="space-y-4">
            <TabsList>
              <TabsTrigger value="matches">
                <Crosshair className="h-3.5 w-3.5" weight="regular" />
                Matches
                {totalMatches > 0 && (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({totalMatches})
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="kaart">
                <MapTrifold className="h-3.5 w-3.5" weight="regular" />
                Kaart
              </TabsTrigger>
              <TabsTrigger value="signals">
                <Lightning className="h-3.5 w-3.5" weight="regular" />
                Signalen
              </TabsTrigger>
              <TabsTrigger value="history">
                <ClockCounterClockwise className="h-3.5 w-3.5" weight="regular" />
                Scan historie
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Gear className="h-3.5 w-3.5" weight="regular" />
                Instellingen
              </TabsTrigger>
            </TabsList>

            {/* ---- Matches Tab ---- */}
            <TabsContent value="matches" className="space-y-4">
              {/* Filter bar + View toggle */}
              {matches.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* View toggle */}
                  <div className="flex items-center rounded-lg border border-border p-0.5 gap-0.5">
                    <button
                      onClick={() => setViewMode("table")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        viewMode === "table"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Rows className="h-3.5 w-3.5" weight="bold" />
                      Tabel
                    </button>
                    <button
                      onClick={() => setViewMode("cards")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        viewMode === "cards"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <List className="h-3.5 w-3.5" weight="bold" />
                      Kaarten
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        viewMode === "grid"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <SquaresFour className="h-3.5 w-3.5" weight="bold" />
                      Grid
                    </button>
                  </div>

                  <div className="h-4 w-px bg-border" />

                  {/* Sort (only for cards/grid — table has its own sorting) */}
                  {viewMode !== "table" && (
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger size="sm" className="h-8 text-xs w-auto min-w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Status filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger size="sm" className="h-8 text-xs w-auto min-w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      {MATCH_STATUS_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* City filter */}
                  {uniqueCities.length > 1 && (
                    <Select value={cityFilter} onValueChange={setCityFilter}>
                      <SelectTrigger size="sm" className="h-8 text-xs w-auto min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle steden</SelectItem>
                        {uniqueCities.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Min score slider */}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Min. score: {minScore}
                    </span>
                    <Slider
                      value={[minScore]}
                      onValueChange={([v]) => setMinScore(v)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-24"
                    />
                  </div>

                  {/* Clear filters */}
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        setStatusFilter("all");
                        setCityFilter("all");
                        setMinScore(0);
                      }}
                    >
                      Wis filters
                    </Button>
                  )}

                  {/* Manual refresh */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1.5 text-muted-foreground"
                    onClick={() => router.refresh()}
                  >
                    <ArrowClockwise className="h-3.5 w-3.5" />
                    Ververs
                  </Button>
                </div>
              )}

              {/* Results summary */}
              {matches.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {filteredMatches.length} van {totalMatches} matches
                  {hasActiveFilters && " (gefilterd)"}
                </p>
              )}

              {/* Match views */}
              {filteredMatches.length === 0 ? (
                hasActiveFilters ? (
                  <div className="flex h-40 flex-col items-center justify-center text-center">
                    <Funnel className="h-6 w-6 text-muted-foreground mb-3" weight="regular" />
                    <p className="text-sm text-muted-foreground">
                      Geen matches gevonden met deze filters.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => {
                        setStatusFilter("all");
                        setCityFilter("all");
                        setMinScore(0);
                      }}
                    >
                      Wis filters
                    </Button>
                  </div>
                ) : (
                  <MatchesEmptyState />
                )
              ) : viewMode === "table" ? (
                <MatchesTable
                  matches={filteredMatches}
                  onStatusChange={handleStatusChange}
                  onSelectMatch={(m) => {
                    setSelectedMatch(m);
                    setDetailSheetOpen(true);
                  }}
                  updatingId={updatingId}
                />
              ) : viewMode === "grid" ? (
                <MatchesGrid
                  matches={filteredMatches}
                  onStatusChange={handleStatusChange}
                  onSelectMatch={(m) => {
                    setSelectedMatch(m);
                    setDetailSheetOpen(true);
                  }}
                  updatingId={updatingId}
                />
              ) : (
                <div className="space-y-3">
                  {filteredMatches.map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                    >
                      <MatchCard
                        match={match}
                        profile={profile}
                        onStatusChange={handleStatusChange}
                        onOpenNotes={(m) => {
                          setNotesMatch(m);
                          setNotesOpen(true);
                        }}
                        updatingId={updatingId}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Detail Sheet for table/grid row clicks */}
              <MatchDetailSheet
                match={selectedMatch}
                open={detailSheetOpen}
                onOpenChange={setDetailSheetOpen}
                onStatusChange={handleStatusChange}
                updatingId={updatingId}
              />
            </TabsContent>

            {/* ---- Kaart Tab ---- */}
            <TabsContent value="kaart" className="min-h-[500px]">
              <IntelligenceMap matches={filteredMatches} />
            </TabsContent>

            {/* ---- Signals Tab ---- */}
            <TabsContent value="signals">
              <SignalsTab matches={matches} />
            </TabsContent>

            {/* ---- Scan History Tab ---- */}
            <TabsContent value="history">
              <ScanHistoryTab
                scanJobs={scanJobs}
                onStartScan={handleStartScan}
                scanning={scanningState}
              />
            </TabsContent>

            {/* ---- Settings Tab ---- */}
            <TabsContent value="settings">
              <SettingsTab
                profile={profile}
                onDelete={handleDelete}
                deleting={deletingState}
              />
            </TabsContent>
          </Tabs>
        </ContentCardBody>
      </ContentCard>

      {/* Notes dialog */}
      <NotesDialog
        match={notesMatch}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        onSave={handleSaveNotes}
        saving={savingNotes}
      />
    </>
  );
}

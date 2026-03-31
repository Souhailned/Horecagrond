"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  MapPin,
  Star,
  Lightning,
  MagnifyingGlass,
  Buildings,
  ChartBar,
  Users,
  House,
  Storefront,
  ForkKnife,
  TrendUp,
  TrendDown,
  CaretRight,
  Globe,
  IdentificationCard,
  ChatCircle,
  NavigationArrow,
  ShieldCheck,
  CheckCircle,
  CircleNotch,
  Info,
  Timer,
  CurrencyEur,
  Ranking,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { updateMatchStatus } from "@/app/actions/intelligence-matches";
import type { MatchWithBusiness } from "@/app/actions/intelligence-matches";
import type { BusinessSourceEvidence, CrawledBusinessIntel } from "@/generated/prisma/client";
import type { PublicDossierView } from "@/lib/intelligence/dossier-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchData = MatchWithBusiness & { snapshots: unknown[] };

interface MatchDetailContentProps {
  match: MatchData;
  crawledIntel: (CrawledBusinessIntel & {
    business?: {
      sourceEvidence?: Array<Pick<
        BusinessSourceEvidence,
        "source" | "status" | "confidence" | "qualityScore" | "fetchedAt" | "expiresAt" | "error"
      >>;
    };
  }) | null;
  dossierView: PublicDossierView | null;
  profileId: string;
}

// Safely typed JSON access helpers
type JsonObj = Record<string, unknown>;

function asObj(val: unknown): JsonObj | null {
  if (val && typeof val === "object" && !Array.isArray(val)) return val as JsonObj;
  return null;
}

function asArr(val: unknown): unknown[] | null {
  if (Array.isArray(val)) return val;
  return null;
}

function asNum(val: unknown): number | null {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  return null;
}

function asStr(val: unknown): string | null {
  if (typeof val === "string" && val.length > 0) return val;
  return null;
}

function formatPriceLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const numeric = map[value];
  if (numeric == null) return value;
  return numeric === 0 ? "Gratis" : "\u20AC".repeat(numeric);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATCH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "Nieuw" },
  { value: "reviewed", label: "Bekeken" },
  { value: "starred", label: "Interessant" },
  { value: "contacted", label: "Gecontacteerd" },
  { value: "dismissed", label: "Afgewezen" },
];

const SCORE_LABELS: { key: string; label: string; max: number }[] = [
  { key: "location", label: "Locatie", max: 30 },
  { key: "concept", label: "Concept", max: 25 },
  { key: "demographics", label: "Demografie", max: 20 },
  { key: "signals", label: "Signalen", max: 15 },
  { key: "surface", label: "Oppervlakte", max: 10 },
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-100 dark:bg-emerald-500/15";
  if (score >= 50) return "bg-amber-100 dark:bg-amber-500/15";
  return "bg-muted";
}

function scoreRingColor(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 50) return "stroke-amber-500";
  return "stroke-muted-foreground/40";
}

function barColor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-muted-foreground/30";
}

function verdictBadgeClass(verdict: string): string {
  switch (verdict) {
    case "direct_action":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "investigate_now":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
    case "deprioritize":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  }
}

function dimensionBadgeClass(status: string): string {
  switch (status) {
    case "strong":
    case "high":
    case "no_immediate_red_flags":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "mixed":
    case "medium":
    case "screening_required":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
    case "attention":
    case "weak":
    case "low":
      return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function humanizeSource(source: string): string {
  return source.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Score Ring component
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={6}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-700", scoreRingColor(score))}
        />
      </svg>
      <span className={cn("absolute text-lg font-semibold", scoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state for missing data
// ---------------------------------------------------------------------------

function DataEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-xl bg-muted p-3">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  trend?: { value: string; positive: boolean } | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      {trend && (
        <div className="flex items-center gap-1">
          {trend.positive ? (
            <TrendUp className="h-3 w-3 text-emerald-500" />
          ) : (
            <TrendDown className="h-3 w-3 text-destructive" />
          )}
          <span className={cn("text-xs font-medium", trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MatchDetailContent({
  match,
  crawledIntel,
  dossierView,
  profileId,
}: MatchDetailContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(match.status);
  const [notes, setNotes] = useState(match.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);

  const business = match.business;
  const breakdown = asObj(match.matchBreakdown as unknown);

  // Parse crawled data
  const kvkData = asObj(crawledIntel?.kvkData as unknown);
  const tripadvisorData = asObj(crawledIntel?.tripadvisorData as unknown);
  const thuisbezorgdData = asObj(crawledIntel?.thuisbezorgdData as unknown);
  const allecijfersData = asObj(crawledIntel?.allecijfersData as unknown);
  const competitorsData = asArr(crawledIntel?.competitorsData as unknown);
  const aiDossierText = dossierView?.aiDossier ?? crawledIntel?.aiDossier ?? null;
  const parsedAiDossier = dossierView?.parsedAiDossier ?? null;
  const brokerInsights = dossierView?.brokerInsights ?? null;
  const brokerDecision = dossierView?.brokerDecision ?? null;
  const sourceEvidence = dossierView?.sourceEvidence ?? [];
  const sourceCoverage = dossierView?.sourceCoverage ?? null;

  // Signal labels from the business signals JSON
  const signalsObj = asObj(business.signals as unknown);
  const signalLabels = signalsObj ? Object.entries(signalsObj).filter(([, v]) => v === true).map(([k]) => k) : [];

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateMatchStatus(match.id, status, notes);
      if (result.success) {
        toast.success("Wijzigingen opgeslagen");
      } else {
        toast.error(result.error ?? "Opslaan mislukt");
      }
    } catch {
      toast.error("Er ging iets mis bij het opslaan");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeepInvestigate() {
    setIsInvestigating(true);
    try {
      const { deepInvestigate } = await import("@/app/actions/intelligence-scan");
      const result = await deepInvestigate(business.id);
      if (result.success) {
        toast.success("Diep onderzoek gestart. Data wordt verzameld...");
        startTransition(() => router.refresh());
      } else {
        toast.error(result.error ?? "Diep onderzoek mislukt");
      }
    } catch {
      toast.error("Diep onderzoek kon niet worden gestart");
    } finally {
      setIsInvestigating(false);
    }
  }

  function handleOpenGoogleMaps() {
    const query = encodeURIComponent(`${business.name} ${business.address} ${business.city}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <ContentCard>
      <ContentCardHeader
        title={business.name}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/intelligence/${profileId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1.5" weight="bold" />
                Terug
              </Button>
            </Link>
          </div>
        }
      />

      <ContentCardBody className="flex flex-col">
        {/* ============================================================ */}
        {/* HEADER BAR                                                   */}
        {/* ============================================================ */}
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Score ring */}
            <ScoreRing score={match.matchScore} size={72} />

            {/* Business info */}
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {business.name}
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {business.address}, {business.city}
                </span>
              </div>
              {/* Signal badges */}
              {signalLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(signalLabels as string[]).slice(0, 5).map((label, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-[11px] border-none bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    >
                      <Lightning className="h-3 w-3 mr-0.5" weight="fill" />
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {business.currentRating != null && (
                <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                  <Star className="h-3.5 w-3.5 text-amber-500" weight="fill" />
                  {business.currentRating.toFixed(1)}
                </div>
              )}
              {business.totalReviews != null && business.totalReviews > 0 && (
                <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                  <ChatCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  {business.totalReviews} reviews
                </div>
              )}
              <div className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                scoreBg(business.signalScore),
                scoreColor(business.signalScore),
              )}>
                <Lightning className="h-3.5 w-3.5" weight="fill" />
                Signaal {business.signalScore}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeepInvestigate}
              disabled={isInvestigating || isPending}
            >
              {isInvestigating ? (
                <CircleNotch className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <MagnifyingGlass className="h-4 w-4 mr-1.5" weight="bold" />
              )}
              Diep Onderzoek
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenGoogleMaps}>
              <NavigationArrow className="h-4 w-4 mr-1.5" />
              Google Maps
            </Button>
            {business.website && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(business.website!, "_blank")}
              >
                <Globe className="h-4 w-4 mr-1.5" />
                Website
              </Button>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* TABS                                                         */}
        {/* ============================================================ */}
        <Tabs defaultValue="overzicht" className="flex-1 flex flex-col">
          <div className="border-b border-border px-4">
            <TabsList className="h-10 bg-transparent p-0 gap-0">
              <TabsTrigger value="overzicht" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Overzicht
              </TabsTrigger>
              <TabsTrigger value="buurt" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Buurt Intelligence
              </TabsTrigger>
              <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Reviews & Reputatie
              </TabsTrigger>
              <TabsTrigger value="concurrentie" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Concurrentie
              </TabsTrigger>
              <TabsTrigger value="bedrijf" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Bedrijfsinfo
              </TabsTrigger>
              <TabsTrigger value="menu" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 text-sm">
                Menu & Delivery
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* -------------------------------------------------------------- */}
            {/* TAB 1: Overzicht                                               */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="overzicht" className="p-4 space-y-6 mt-0">
              {/* Score breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Score circle + breakdown bars */}
                <div className="rounded-2xl border border-border bg-background p-6 space-y-6">
                  <div className="flex items-center gap-2">
                    <ChartBar className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Score Breakdown</h3>
                  </div>

                  <div className="flex items-center justify-center">
                    <ScoreRing score={match.matchScore} size={120} />
                  </div>

                  <div className="space-y-3">
                    {SCORE_LABELS.map((item) => {
                      const value = asNum(breakdown?.[item.key]) ?? 0;
                      const pct = Math.round((value / item.max) * 100);
                      return (
                        <div key={item.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium text-foreground">
                              {value}/{item.max}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", barColor(value, item.max))}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Broker decision layer */}
                <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Broker Beslislaag</h3>
                    {brokerDecision && (
                      <Badge
                        variant="secondary"
                        className={cn("ml-auto text-[11px] border-none", verdictBadgeClass(brokerDecision.verdict))}
                      >
                        {brokerDecision.verdictLabel}
                      </Badge>
                    )}
                  </div>

                  {brokerDecision ? (
                    <div className="space-y-4 text-sm text-foreground">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">
                            Vertrouwen: {dossierView?.confidenceLevel ?? "Onbekend"}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn("text-[11px] border-none", dimensionBadgeClass(brokerDecision.legalReadiness.status))}
                          >
                            {brokerDecision.legalReadiness.label}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn("text-[11px] border-none", dimensionBadgeClass(brokerDecision.economicFeasibility.status))}
                          >
                            {brokerDecision.economicFeasibility.label}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn("text-[11px] border-none", dimensionBadgeClass(brokerDecision.transitionPotential.status))}
                          >
                            {brokerDecision.transitionPotential.label}
                          </Badge>
                        </div>
                        <p className="mt-3 leading-relaxed">{brokerDecision.summary}</p>
                      </div>

                      {brokerDecision.whyInteresting.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Waarom interessant</p>
                          <div className="space-y-2">
                            {brokerDecision.whyInteresting.slice(0, 4).map((item) => (
                              <div key={item} className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5" weight="fill" />
                                <p className="leading-relaxed">{item}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {brokerDecision.watchouts.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Aandachtspunten</p>
                          <div className="space-y-2">
                            {brokerDecision.watchouts.slice(0, 3).map((item) => (
                              <div key={item} className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-amber-500 mt-0.5" />
                                <p className="leading-relaxed">{item}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Next best action</p>
                        <p className="leading-relaxed">{brokerDecision.nextAction}</p>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Bewijs & vertrouwen</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {brokerDecision.confidenceNote}
                        </p>
                        {sourceCoverage && (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {sourceCoverage.available.map((src) => (
                                <Badge key={src} variant="outline" className="text-[11px]">
                                  {humanizeSource(src)}
                                </Badge>
                              ))}
                            </div>
                            {sourceCoverage.missingCritical.length > 0 && (
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                Kritieke hiaten: {sourceCoverage.missingCritical.map(humanizeSource).join(", ")}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {brokerInsights && brokerInsights.acquisitionSignals.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Onderbouwende signalen</p>
                          <div className="flex flex-wrap gap-1.5">
                            {brokerInsights.acquisitionSignals.slice(0, 4).map((signal) => (
                              <Badge key={signal} variant="outline" className="text-[11px]">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {(parsedAiDossier?.executiveSummary || parsedAiDossier?.takeoverSignals || parsedAiDossier?.recommendation || aiDossierText) && (
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-3">
                          <p className="text-xs font-medium text-muted-foreground">AI dossier ter context</p>
                          {parsedAiDossier?.executiveSummary && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Samenvatting</p>
                              <p className="leading-relaxed">{parsedAiDossier.executiveSummary}</p>
                            </div>
                          )}
                          {parsedAiDossier?.takeoverSignals && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Overname signalen</p>
                              <p className="leading-relaxed">{parsedAiDossier.takeoverSignals}</p>
                            </div>
                          )}
                          {parsedAiDossier?.recommendation && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Aanbeveling</p>
                              <p className="leading-relaxed">{parsedAiDossier.recommendation}</p>
                            </div>
                          )}
                          {!parsedAiDossier?.executiveSummary && aiDossierText && (
                            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                              {aiDossierText}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <DataEmptyState message="Brokerbeslislaag beschikbaar na diep onderzoek" />
                  )}
                </div>
              </div>

              {/* AI Summary (from match) */}
              {match.aiSummary && (
                <div className="rounded-2xl border border-border bg-background p-6 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">AI Match Analyse</h3>
                  <p className="text-sm text-foreground leading-relaxed">{match.aiSummary}</p>
                </div>
              )}

              {/* Quick stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Match Score"
                  value={`${match.matchScore}/100`}
                  icon={ChartBar}
                />
                <StatCard
                  label="Signaal Score"
                  value={`${business.signalScore}/100`}
                  icon={Lightning}
                />
                <StatCard
                  label="Google Rating"
                  value={business.currentRating?.toFixed(1) ?? "-"}
                  icon={Star}
                />
                <StatCard
                  label="Reviews"
                  value={business.totalReviews ?? 0}
                  icon={ChatCircle}
                />
              </div>

              {sourceEvidence.length > 0 && (
                <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Bron Evidence</h3>
                  </div>
                  <div className="space-y-2">
                    {sourceEvidence.map((item) => (
                      <div
                        key={item.source}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{item.source}</span>
                          <Badge variant="outline" className="text-[11px]">
                            {item.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>confidence: {item.confidence}</span>
                          {item.qualityScore != null && <span>quality: {item.qualityScore}</span>}
                          {item.error && <span className="text-destructive">{item.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* -------------------------------------------------------------- */}
            {/* TAB 2: Buurt Intelligence                                       */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="buurt" className="p-4 space-y-6 mt-0">
              {allecijfersData ? (
                <>
                  {/* Stats grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                      label="Inwoners"
                      value={asNum(allecijfersData.inwoners)?.toLocaleString("nl-NL") ?? "-"}
                      icon={Users}
                      trend={asStr(allecijfersData.inwonersGroei) ? { value: asStr(allecijfersData.inwonersGroei)!, positive: true } : null}
                    />
                    <StatCard
                      label="Gem. Woningwaarde"
                      value={asNum(allecijfersData.gemWoningwaarde)
                        ? `\u20AC${asNum(allecijfersData.gemWoningwaarde)!.toLocaleString("nl-NL")}`
                        : "-"}
                      icon={House}
                      trend={asStr(allecijfersData.woningwaardeGroei) ? { value: asStr(allecijfersData.woningwaardeGroei)!, positive: true } : null}
                    />
                    <StatCard
                      label="Bedrijven in buurt"
                      value={asNum(allecijfersData.aantalBedrijven)?.toLocaleString("nl-NL") ?? "-"}
                      icon={Buildings}
                    />
                  </div>

                  {/* Straat info */}
                  {asObj(allecijfersData.straatInfo) && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Straat Informatie</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {asNum(asObj(allecijfersData.straatInfo)?.adressen) != null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Adressen</p>
                            <p className="text-sm font-medium text-foreground">
                              {asNum(asObj(allecijfersData.straatInfo)!.adressen)}
                            </p>
                          </div>
                        )}
                        {asNum(asObj(allecijfersData.straatInfo)?.panden) != null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Panden</p>
                            <p className="text-sm font-medium text-foreground">
                              {asNum(asObj(allecijfersData.straatInfo)!.panden)}
                            </p>
                          </div>
                        )}
                        {asNum(asObj(allecijfersData.straatInfo)?.inwoners) != null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Inwoners (straat)</p>
                            <p className="text-sm font-medium text-foreground">
                              {asNum(asObj(allecijfersData.straatInfo)!.inwoners)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Huishoud info */}
                  {asObj(allecijfersData.huishoudInfo) && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Huishoud Informatie</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {asStr(asObj(allecijfersData.huishoudInfo)?.gemGrootte) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Gem. huishoudgrootte</p>
                            <p className="text-sm font-medium text-foreground">
                              {asStr(asObj(allecijfersData.huishoudInfo)!.gemGrootte)}
                            </p>
                          </div>
                        )}
                        {asStr(asObj(allecijfersData.huishoudInfo)?.huurPercentage) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Huurpercentage</p>
                            <p className="text-sm font-medium text-foreground">
                              {asStr(asObj(allecijfersData.huishoudInfo)!.huurPercentage)}
                            </p>
                          </div>
                        )}
                        {asStr(asObj(allecijfersData.huishoudInfo)?.gemInkomen) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Gem. inkomen</p>
                            <p className="text-sm font-medium text-foreground">
                              {asStr(asObj(allecijfersData.huishoudInfo)!.gemInkomen)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Demographics */}
                  {asObj(allecijfersData.demografie) && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Demografie</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {Object.entries(asObj(allecijfersData.demografie)!).map(([key, val]) => (
                          <div key={key}>
                            <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                            <p className="text-sm font-medium text-foreground">
                              {typeof val === "number" ? val.toLocaleString("nl-NL") : String(val)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <DataEmptyState message="Buurt data niet beschikbaar. Start een diep onderzoek om deze gegevens op te halen." />
              )}
            </TabsContent>

            {/* -------------------------------------------------------------- */}
            {/* TAB 3: Reviews & Reputatie                                      */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="reviews" className="p-4 space-y-6 mt-0">
              {tripadvisorData || thuisbezorgdData ? (
                <>
                  {/* Review platform cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* TripAdvisor */}
                    {tripadvisorData && (
                      <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">TripAdvisor</h3>
                          {asStr(tripadvisorData.url) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => window.open(asStr(tripadvisorData.url)!, "_blank")}
                            >
                              Bekijk
                              <CaretRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          {asNum(tripadvisorData.rating) != null && (
                            <div className="flex items-center gap-1.5">
                              <Star className="h-5 w-5 text-amber-500" weight="fill" />
                              <span className="text-2xl font-semibold text-foreground">
                                {asNum(tripadvisorData.rating)!.toFixed(1)}
                              </span>
                            </div>
                          )}
                          {asStr(tripadvisorData.ranking) && (
                            <Badge variant="secondary" className="text-[11px] border-none">
                              <Ranking className="h-3 w-3 mr-0.5" />
                              {asStr(tripadvisorData.ranking)}
                            </Badge>
                          )}
                        </div>

                        {asNum(tripadvisorData.totalReviews) != null && (
                          <p className="text-xs text-muted-foreground">
                            {asNum(tripadvisorData.totalReviews)} reviews
                          </p>
                        )}

                        {/* Cuisine types */}
                        {asArr(tripadvisorData.cuisineTypes) && (
                          <div className="flex flex-wrap gap-1.5">
                            {(asArr(tripadvisorData.cuisineTypes)! as string[]).map((cuisine, i) => (
                              <Badge key={i} variant="outline" className="text-[11px]">
                                {cuisine}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Recent reviews */}
                        {asArr(tripadvisorData.recentReviews) && (asArr(tripadvisorData.recentReviews)!).length > 0 && (
                          <div className="space-y-3 pt-2 border-t border-border/40">
                            <p className="text-xs font-medium text-muted-foreground">Recente Reviews</p>
                            {(asArr(tripadvisorData.recentReviews)! as JsonObj[]).slice(0, 3).map((review, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex items-center gap-2">
                                  {asNum(review.rating) != null && (
                                    <div className="flex items-center gap-0.5">
                                      {Array.from({ length: 5 }).map((_, j) => (
                                        <Star
                                          key={j}
                                          className={cn("h-3 w-3", j < (asNum(review.rating) ?? 0) ? "text-amber-500" : "text-muted")}
                                          weight={j < (asNum(review.rating) ?? 0) ? "fill" : "regular"}
                                        />
                                      ))}
                                    </div>
                                  )}
                                  {asStr(review.date) && (
                                    <span className="text-[11px] text-muted-foreground">{asStr(review.date)}</span>
                                  )}
                                </div>
                                {asStr(review.title) && (
                                  <p className="text-xs font-medium text-foreground">{asStr(review.title)}</p>
                                )}
                                {asStr(review.text) && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">{asStr(review.text)}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thuisbezorgd */}
                    {thuisbezorgdData && (
                      <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">Thuisbezorgd</h3>
                          {asStr(thuisbezorgdData.url) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => window.open(asStr(thuisbezorgdData.url)!, "_blank")}
                            >
                              Bekijk
                              <CaretRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          {asNum(thuisbezorgdData.rating) != null && (
                            <div className="flex items-center gap-1.5">
                              <Star className="h-5 w-5 text-amber-500" weight="fill" />
                              <span className="text-2xl font-semibold text-foreground">
                                {asNum(thuisbezorgdData.rating)!.toFixed(1)}
                              </span>
                            </div>
                          )}
                          {asNum(thuisbezorgdData.reviewCount) != null && (
                            <span className="text-xs text-muted-foreground">
                              {asNum(thuisbezorgdData.reviewCount)} reviews
                            </span>
                          )}
                        </div>

                        {/* Delivery stats */}
                        <div className="grid grid-cols-2 gap-3">
                          {asStr(thuisbezorgdData.deliveryTime) && (
                            <div className="rounded-xl bg-muted/50 p-3">
                              <p className="text-xs text-muted-foreground">Levertijd</p>
                              <p className="text-sm font-medium text-foreground">{asStr(thuisbezorgdData.deliveryTime)}</p>
                            </div>
                          )}
                          {(asNum(thuisbezorgdData.minOrder) != null || asStr(thuisbezorgdData.minOrder)) && (
                            <div className="rounded-xl bg-muted/50 p-3">
                              <p className="text-xs text-muted-foreground">Min. bestelling</p>
                              <p className="text-sm font-medium text-foreground">
                                {typeof thuisbezorgdData.minOrder === "number"
                                  ? `\u20AC${thuisbezorgdData.minOrder.toFixed(2)}`
                                  : asStr(thuisbezorgdData.minOrder)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Cuisine */}
                        {asArr(thuisbezorgdData.cuisines) && (
                          <div className="flex flex-wrap gap-1.5">
                            {(asArr(thuisbezorgdData.cuisines)! as string[]).map((cuisine, i) => (
                              <Badge key={i} variant="outline" className="text-[11px]">
                                {cuisine}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Google Places rating (from MonitoredBusiness) */}
                  <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Google Places</h3>
                    <div className="flex items-center gap-6">
                      {business.currentRating != null && (
                        <div className="flex items-center gap-2">
                          <Star className="h-6 w-6 text-amber-500" weight="fill" />
                          <span className="text-3xl font-semibold text-foreground">
                            {business.currentRating.toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">/5</span>
                        </div>
                      )}
                      {business.totalReviews != null && (
                        <div>
                          <p className="text-sm font-medium text-foreground">{business.totalReviews}</p>
                          <p className="text-xs text-muted-foreground">Google reviews</p>
                        </div>
                      )}
                      {business.priceLevel != null && (
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {formatPriceLevel(business.priceLevel)}
                          </p>
                          <p className="text-xs text-muted-foreground">Prijsniveau</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <DataEmptyState message="Reviews data wordt geladen bij diep onderzoek" />
              )}
            </TabsContent>

            {/* -------------------------------------------------------------- */}
            {/* TAB 4: Concurrentie                                             */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="concurrentie" className="p-4 space-y-6 mt-0">
              {competitorsData && competitorsData.length > 0 ? (
                <>
                  {/* Competition density indicator */}
                  <div className="flex items-center gap-3">
                    <CompetitionDensityBadge count={competitorsData.length} />
                    <span className="text-sm text-muted-foreground">
                      {competitorsData.length} concurrenten gevonden in de buurt
                    </span>
                  </div>

                  {/* Average rating comparison */}
                  {(() => {
                    const ratings = competitorsData
                      .map((c) => asNum(asObj(c)?.rating))
                      .filter((r): r is number => r !== null);
                    const avgRating = ratings.length > 0
                      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length)
                      : null;

                    return avgRating != null ? (
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Gem. rating concurrenten</p>
                            <p className="text-xl font-semibold text-foreground">{avgRating.toFixed(1)}</p>
                          </div>
                          {business.currentRating != null && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Deze zaak</p>
                              <p className={cn("text-xl font-semibold", business.currentRating >= avgRating ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                                {business.currentRating.toFixed(1)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Competitors table */}
                  <div className="rounded-2xl border border-border bg-background overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Naam</TableHead>
                          <TableHead className="text-xs">Rating</TableHead>
                          <TableHead className="text-xs">Reviews</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Afstand</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Prijsniveau</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Keuken</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(competitorsData as JsonObj[]).map((comp, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-medium">
                              {asStr(comp.name) ?? "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 text-amber-500" weight="fill" />
                                <span className="text-sm">
                                  {asNum(comp.rating)?.toFixed(1) ?? "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {asNum(comp.reviewCount)?.toLocaleString("nl-NL") ?? asNum(comp.reviews)?.toLocaleString("nl-NL") ?? "-"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                              {asStr(comp.distance) ?? (asNum(comp.distance) != null ? `${asNum(comp.distance)} m` : "-")}
                            </TableCell>
                            <TableCell className="text-sm hidden md:table-cell">
                              {asNum(comp.priceLevel) != null
                                ? "\u20AC".repeat(asNum(comp.priceLevel)!)
                                : asStr(comp.priceLevel) ?? "-"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                              {asStr(comp.cuisine) ?? (asArr(comp.cuisines) ? (asArr(comp.cuisines)! as string[]).join(", ") : "-")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <DataEmptyState message="Concurrentie analyse beschikbaar na diep onderzoek" />
              )}
            </TabsContent>

            {/* -------------------------------------------------------------- */}
            {/* TAB 5: Bedrijfsinfo (KvK)                                       */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="bedrijf" className="p-4 space-y-6 mt-0">
              {kvkData ? (
                <>
                  <div className="rounded-2xl border border-border bg-background p-6 space-y-5">
                    <div className="flex items-center gap-2">
                      <IdentificationCard className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">KvK Gegevens</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {asStr(kvkData.kvkNumber) && (
                        <div>
                          <p className="text-xs text-muted-foreground">KvK Nummer</p>
                          <p className="text-sm font-medium text-foreground font-mono">{asStr(kvkData.kvkNumber)}</p>
                        </div>
                      )}
                      {asStr(kvkData.eigenaar) && (
                        <div>
                          <p className="text-xs text-muted-foreground">Eigenaar</p>
                          <p className="text-sm font-medium text-foreground">{asStr(kvkData.eigenaar)}</p>
                        </div>
                      )}
                      {asStr(kvkData.rechtsvorm) && (
                        <div>
                          <p className="text-xs text-muted-foreground">Rechtsvorm</p>
                          <p className="text-sm font-medium text-foreground">{asStr(kvkData.rechtsvorm)}</p>
                        </div>
                      )}
                      {asStr(kvkData.oprichtingsdatum) && (
                        <div>
                          <p className="text-xs text-muted-foreground">Oprichtingsdatum</p>
                          <p className="text-sm font-medium text-foreground">{asStr(kvkData.oprichtingsdatum)}</p>
                        </div>
                      )}
                      {asStr(kvkData.hoofdactiviteit) && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground">Hoofdactiviteit</p>
                          <p className="text-sm font-medium text-foreground">{asStr(kvkData.hoofdactiviteit)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SBI Codes */}
                  {asArr(kvkData.sbiCodes) && (asArr(kvkData.sbiCodes)!).length > 0 && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">SBI Codes</h3>
                      <div className="space-y-2">
                        {(asArr(kvkData.sbiCodes)! as (string | JsonObj)[]).map((sbi, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              {typeof sbi === "string" ? sbi : asStr((sbi as JsonObj).code) ?? String(i + 1)}
                            </span>
                            {typeof sbi !== "string" && asStr((sbi as JsonObj).description) && (
                              <span className="text-sm text-foreground">
                                {asStr((sbi as JsonObj).description)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Handelsnamen */}
                  {asArr(kvkData.handelsnamen) && (asArr(kvkData.handelsnamen)!).length > 0 && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Handelsnamen</h3>
                      <div className="flex flex-wrap gap-2">
                        {(asArr(kvkData.handelsnamen)! as string[]).map((naam, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {naam}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vestigingen */}
                  {asArr(kvkData.vestigingen) && (asArr(kvkData.vestigingen)!).length > 1 && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Storefront className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">
                          Vestigingen ({asArr(kvkData.vestigingen)!.length})
                        </h3>
                        <Badge variant="secondary" className="text-[11px] border-none bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                          Keten
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {(asArr(kvkData.vestigingen)! as (string | JsonObj)[]).map((vest, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm text-foreground">
                              {typeof vest === "string"
                                ? vest
                                : asStr((vest as JsonObj).address) ?? asStr((vest as JsonObj).naam) ?? `Vestiging ${i + 1}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <DataEmptyState message="Bedrijfsgegevens worden geladen bij diep onderzoek" />
              )}
            </TabsContent>

            {/* -------------------------------------------------------------- */}
            {/* TAB 6: Menu & Delivery                                          */}
            {/* -------------------------------------------------------------- */}
            <TabsContent value="menu" className="p-4 space-y-6 mt-0">
              {thuisbezorgdData ? (
                <>
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {asNum(thuisbezorgdData.rating) != null && (
                      <StatCard
                        label="Delivery Rating"
                        value={asNum(thuisbezorgdData.rating)!.toFixed(1)}
                        icon={Star}
                      />
                    )}
                    {asStr(thuisbezorgdData.deliveryTime) && (
                      <StatCard
                        label="Levertijd"
                        value={asStr(thuisbezorgdData.deliveryTime)!}
                        icon={Timer}
                      />
                    )}
                    {(asNum(thuisbezorgdData.minOrder) != null || asStr(thuisbezorgdData.minOrder)) && (
                      <StatCard
                        label="Min. Bestelling"
                        value={typeof thuisbezorgdData.minOrder === "number"
                          ? `\u20AC${(thuisbezorgdData.minOrder as number).toFixed(2)}`
                          : asStr(thuisbezorgdData.minOrder) ?? "-"}
                        icon={CurrencyEur}
                      />
                    )}
                    {asNum(thuisbezorgdData.reviewCount) != null && (
                      <StatCard
                        label="Reviews"
                        value={asNum(thuisbezorgdData.reviewCount)!}
                        icon={ChatCircle}
                      />
                    )}
                  </div>

                  {/* Cuisine types */}
                  {asArr(thuisbezorgdData.cuisines) && (
                    <div className="flex items-center gap-2">
                      <ForkKnife className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-wrap gap-1.5">
                        {(asArr(thuisbezorgdData.cuisines)! as string[]).map((cuisine, i) => (
                          <Badge key={i} variant="outline" className="text-[11px]">
                            {cuisine}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Average price badge */}
                  {asNum(thuisbezorgdData.averagePrice) != null && (
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Gemiddelde prijs</p>
                          <p className="text-xl font-semibold text-foreground">
                            {"\u20AC"}{asNum(thuisbezorgdData.averagePrice)!.toFixed(2)}
                          </p>
                        </div>
                        <CurrencyEur className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {/* Menu items */}
                  {asArr(thuisbezorgdData.menuItems) && (asArr(thuisbezorgdData.menuItems)!).length > 0 && (
                    <div className="rounded-2xl border border-border bg-background overflow-hidden">
                      <div className="px-6 py-4 border-b border-border/40">
                        <h3 className="text-sm font-semibold text-foreground">
                          Menu ({asArr(thuisbezorgdData.menuItems)!.length} items)
                        </h3>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Naam</TableHead>
                            <TableHead className="text-xs">Prijs</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Categorie</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(asArr(thuisbezorgdData.menuItems)! as JsonObj[]).slice(0, 30).map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm font-medium">
                                {asStr(item.name) ?? "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {asNum(item.price) != null
                                  ? `\u20AC${asNum(item.price)!.toFixed(2)}`
                                  : asStr(item.price) ?? "-"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                                {asStr(item.category) ?? "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {(asArr(thuisbezorgdData.menuItems)!).length > 30 && (
                        <div className="px-6 py-3 border-t border-border/40 text-center">
                          <span className="text-xs text-muted-foreground">
                            + {(asArr(thuisbezorgdData.menuItems)!).length - 30} meer items
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Menu categories summary */}
                  {asArr(thuisbezorgdData.menuCategories) && (
                    <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Menu Categorieen</h3>
                      <div className="flex flex-wrap gap-2">
                        {(asArr(thuisbezorgdData.menuCategories)! as string[]).map((cat, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <DataEmptyState message="Menu data wordt geladen bij diep onderzoek" />
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* ============================================================ */}
        {/* BOTTOM BAR                                                   */}
        {/* ============================================================ */}
        <div className="border-t border-border px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            {/* Status select */}
            <div className="space-y-1.5 w-full sm:w-auto">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="flex-1 space-y-1.5 w-full">
              <label className="text-xs font-medium text-muted-foreground">Notities</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Voeg notities toe over deze match..."
                className="min-h-[60px] resize-none"
              />
            </div>

            {/* Save */}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="shrink-0"
            >
              {isSaving ? (
                <CircleNotch className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1.5" weight="bold" />
              )}
              Opslaan
            </Button>
          </div>
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

// ---------------------------------------------------------------------------
// Competition density badge
// ---------------------------------------------------------------------------

function CompetitionDensityBadge({ count }: { count: number }) {
  let label: string;
  let className: string;

  if (count >= 15) {
    label = "Hoog";
    className = "bg-destructive/10 text-destructive";
  } else if (count >= 7) {
    label = "Gemiddeld";
    className = "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  } else {
    label = "Laag";
    className = "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  }

  return (
    <Badge variant="secondary" className={cn("text-[11px] border-none", className)}>
      Concurrentie: {label}
    </Badge>
  );
}

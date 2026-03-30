"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  Star,
  MapPin,
  Globe,
  Phone,
  ArrowSquareOut,
  ShieldCheck,
  Footprints,
  Buildings,
  Lightning,
  ChatCircle,
  TrendUp,
  TrendDown,
  Minus,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { SharedReportMatch } from "@/components/intelligence/report/types";

// ---------------------------------------------------------------------------
// Score ring component
// ---------------------------------------------------------------------------

function ScoreRing({
  score,
  size = 56,
}: {
  score: number;
  size?: number;
}) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const color =
    score >= 80
      ? "text-primary"
      : score >= 60
        ? "text-chart-2"
        : "text-muted-foreground";

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className={color}
        />
      </svg>
      <span
        className={cn(
          "absolute text-sm font-bold tabular-nums",
          color,
        )}
      >
        {score}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating display
// ---------------------------------------------------------------------------

function RatingDisplay({
  rating,
  reviews,
  label,
}: {
  rating: number | null;
  reviews: number | null;
  label?: string;
}) {
  if (rating === null) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Star weight="fill" className="h-3.5 w-3.5 text-amber-500" />
      <span className="font-medium text-foreground">
        {rating.toFixed(1)}
      </span>
      {reviews !== null && (
        <span>
          ({reviews.toLocaleString("nl-NL")}{" "}
          {label ? label : "reviews"})
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal badge
// ---------------------------------------------------------------------------

function SignalBadge({
  score,
}: {
  score: number;
}) {
  if (score >= 70) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-primary/20 bg-primary/5 text-primary"
      >
        <TrendUp weight="bold" className="h-3 w-3" />
        Sterke signalen
      </Badge>
    );
  }
  if (score >= 40) {
    return (
      <Badge variant="outline" className="gap-1">
        <Minus weight="bold" className="h-3 w-3" />
        Gemiddeld
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-destructive/20 bg-destructive/5 text-destructive"
    >
      <TrendDown weight="bold" className="h-3 w-3" />
      Dalend
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------------

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: PhosphorIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <Icon weight="duotone" className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-xs font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence indicator
// ---------------------------------------------------------------------------

function ConfidenceIndicator({ level }: { level: string }) {
  const levels: Record<string, { dots: number; label: string }> = {
    Hoog: { dots: 3, label: "Hoge betrouwbaarheid" },
    Gemiddeld: { dots: 2, label: "Gemiddelde betrouwbaarheid" },
    Laag: { dots: 1, label: "Lage betrouwbaarheid" },
  };

  const config = levels[level] ?? levels.Laag;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck weight="duotone" className="h-3.5 w-3.5" />
      <span>{config.label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3].map((dot) => (
          <div
            key={dot}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              dot <= config.dots
                ? "bg-primary"
                : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function VerdictBadge({
  verdict,
  label,
}: {
  verdict: string;
  label: string;
}) {
  const classes: Record<string, string> = {
    direct_action: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    investigate_now: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    monitor: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    deprioritize: "border-border bg-muted/60 text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("gap-1", classes[verdict] ?? classes.monitor)}
    >
      <ShieldCheck weight="duotone" className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Card
// ---------------------------------------------------------------------------

interface ReportMatchCardProps {
  match: SharedReportMatch;
}

export function ReportMatchCard({ match }: ReportMatchCardProps) {
  const { business, dossier, matchScore, aiSummary } = match;

  return (
    <div className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md print:shadow-none print:break-inside-avoid">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        {/* Score ring */}
        <div className="hidden shrink-0 sm:block">
          <ScoreRing score={matchScore} />
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 sm:hidden">
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                matchScore >= 80
                  ? "text-primary"
                  : matchScore >= 60
                    ? "text-chart-2"
                    : "text-muted-foreground",
              )}
            >
              {matchScore}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground sm:text-lg">
              {business.name}
            </h3>
            {business.businessType && (
              <Badge variant="secondary" className="text-[10px]">
                {business.businessType}
              </Badge>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin weight="fill" className="h-3.5 w-3.5" />
              <span>
                {business.address}, {business.city}
              </span>
            </div>
            <RatingDisplay
              rating={business.currentRating}
              reviews={business.totalReviews}
              label="Google reviews"
            />
            {business.tripadvisorRating && (
              <RatingDisplay
                rating={business.tripadvisorRating}
                reviews={business.tripadvisorReviews}
                label="TripAdvisor"
              />
            )}
          </div>

          {/* Signal + confidence row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SignalBadge score={business.signalScore} />
            {dossier && (
              <ConfidenceIndicator level={dossier.confidenceLevel} />
            )}
            {dossier && (
              <VerdictBadge
                verdict={dossier.brokerDecision.verdict}
                label={dossier.brokerDecision.verdictLabel}
              />
            )}
          </div>
        </div>
      </div>

      {dossier && (
        <>
          <Separator />
          <div className="px-5 py-4 sm:px-6">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <ShieldCheck weight="duotone" className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Broker Verdict
                </span>
              </div>
              <p className="text-sm font-medium leading-relaxed text-foreground">
                {dossier.brokerDecision.summary}
              </p>
              {dossier.brokerDecision.whyInteresting.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dossier.brokerDecision.whyInteresting.slice(0, 2).map((item) => (
                    <Badge key={item} variant="secondary" className="max-w-full text-[10px]">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-background/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Next action
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/85">
                  {dossier.brokerDecision.nextAction}
                </p>
              </div>
              {dossier.brokerDecision.missingCriticalSources.length > 0 && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  Kritieke hiaten: {dossier.brokerDecision.missingCriticalSources.join(", ")}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* AI Summary */}
      {aiSummary && (
        <>
          <Separator />
          <div className="px-5 py-4 sm:px-6">
            <div className="mb-2 flex items-center gap-1.5">
              <Lightning
                weight="fill"
                className="h-3.5 w-3.5 text-primary"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AI Analyse
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {aiSummary}
            </p>
          </div>
        </>
      )}

      {/* Stats row */}
      {(business.passantenPerDag || business.locationScore || business.website || business.phone) && (
        <>
          <Separator />
          <div className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {business.passantenPerDag && (
                <StatPill
                  icon={Footprints}
                  label="Passanten"
                  value={`${business.passantenPerDag.toLocaleString("nl-NL")}/dag`}
                />
              )}
              {business.locationScore && (
                <StatPill
                  icon={Buildings}
                  label="Locatiescore"
                  value={`${business.locationScore}/100`}
                />
              )}
              {business.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
                >
                  <Globe weight="duotone" className="h-4 w-4" />
                  <span>Website</span>
                  <ArrowSquareOut className="h-3 w-3" />
                </a>
              )}
              {business.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
                >
                  <Phone weight="duotone" className="h-4 w-4" />
                  <span>{business.phone}</span>
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {/* AI Dossier excerpt (if available) */}
      {dossier?.aiDossier && (
        <>
          <Separator />
          <details className="group/details print:open">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-6">
              <ChatCircle weight="duotone" className="h-3.5 w-3.5" />
              <span>Bekijk uitgebreide analyse</span>
              <svg
                className="ml-auto h-3 w-3 transition-transform group-open/details:rotate-180"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                  {dossier.aiDossier}
                </p>
                {dossier.sourcesCompleted.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {dossier.sourcesCompleted.map((source) => (
                      <Badge
                        key={source}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {source}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

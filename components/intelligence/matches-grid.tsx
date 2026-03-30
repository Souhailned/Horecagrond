"use client";

import {
  Star,
  Lightning,
  Phone,
  Globe,
} from "@phosphor-icons/react/dist/ssr";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchWithBusiness } from "@/app/actions/intelligence-matches";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchesGridProps {
  matches: MatchWithBusiness[];
  onStatusChange: (matchId: string, status: string) => void;
  onSelectMatch: (match: MatchWithBusiness) => void;
  updatingId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  reviewed: "Bekeken",
  starred: "Interessant",
  contacted: "Gecontacteerd",
  dismissed: "Afgewezen",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreClasses(score: number): string {
  if (score >= 80) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  }
  if (score >= 50) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  }
  return "bg-muted text-muted-foreground";
}

function parseSignalCount(signals: unknown): number {
  if (!signals) return 0;
  if (Array.isArray(signals)) return signals.length;
  if (typeof signals === "object" && signals !== null) {
    return Object.values(signals as Record<string, unknown>).filter(
      (v) => v === true || (typeof v === "number" && v > 0),
    ).length;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Mini Match Card
// ---------------------------------------------------------------------------

interface MiniMatchCardProps {
  match: MatchWithBusiness;
  onStatusChange: (matchId: string, status: string) => void;
  onSelectMatch: (match: MatchWithBusiness) => void;
  isUpdating: boolean;
}

function MiniMatchCard({
  match,
  onStatusChange,
  onSelectMatch,
  isUpdating,
}: MiniMatchCardProps) {
  const { business } = match;
  const score = match.matchScore;
  const signalCount = parseSignalCount(business.signals);

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-xl border border-border bg-background p-3 space-y-1.5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      onClick={() => onSelectMatch(match)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectMatch(match);
        }
      }}
    >
      {/* Row 1: Score badge + Name */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "flex items-center justify-center w-9 h-7 rounded-lg text-xs font-bold shrink-0",
            getScoreClasses(score),
          )}
        >
          {score}
        </span>
        <span className="text-sm font-semibold text-foreground truncate">
          {business.name}
        </span>
      </div>

      {/* Row 2: Rating + Signals */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {business.currentRating != null && (
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 text-amber-500" weight="fill" />
            <span>
              {business.currentRating}
              {business.totalReviews != null && (
                <span className="ml-0.5">({business.totalReviews})</span>
              )}
            </span>
          </span>
        )}
        {business.currentRating != null && signalCount > 0 && (
          <span className="text-border">&middot;</span>
        )}
        {signalCount > 0 && (
          <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
            <Lightning className="h-3 w-3" weight="fill" />
            <span>
              {signalCount} {signalCount === 1 ? "signaal" : "signalen"}
            </span>
          </span>
        )}
      </div>

      {/* Row 3: City + Type */}
      <div className="text-xs text-muted-foreground truncate">
        {business.city}
        {business.businessType && (
          <>
            <span className="mx-1 text-border">&middot;</span>
            <span className="capitalize">
              {business.businessType.replace(/_/g, " ")}
            </span>
          </>
        )}
      </div>

      {/* Row 4: Status select + contact icons */}
      <div className="flex items-center justify-between gap-2">
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Select
            value={match.status}
            onValueChange={(value) => onStatusChange(match.id, value)}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-7 text-xs w-auto min-w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          {business.phone && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a href={`tel:${business.phone}`} title="Bel">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" weight="regular" />
              </a>
            </Button>
          )}
          {business.website && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer"
                title="Website"
              >
                <Globe className="h-3.5 w-3.5 text-muted-foreground" weight="regular" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches Grid
// ---------------------------------------------------------------------------

export function MatchesGrid({
  matches,
  onStatusChange,
  onSelectMatch,
  updatingId,
}: MatchesGridProps) {
  if (matches.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">
          Geen matches gevonden met de huidige filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {matches.map((match) => (
        <MiniMatchCard
          key={match.id}
          match={match}
          onStatusChange={onStatusChange}
          onSelectMatch={onSelectMatch}
          isUpdating={updatingId === match.id}
        />
      ))}
    </div>
  );
}

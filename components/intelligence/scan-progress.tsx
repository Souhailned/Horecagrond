"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  MagnifyingGlass,
  Brain,
  Lightning,
  ChartLineUp,
} from "@phosphor-icons/react/dist/ssr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanStatus {
  step: string;
  label: string;
  city?: string;
  citiesCompleted?: number;
  citiesTotal?: number;
  businessesFound?: number;
  matchesFound?: number;
  progress?: number;
}

interface ScanProgressProps {
  jobId: string;
  onComplete?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STEP_ICONS: Record<string, React.ComponentType<any>> = {
  loading: CircleNotch,
  scanning: MagnifyingGlass,
  classifying: Brain,
  detecting: Lightning,
  matching: ChartLineUp,
  summarizing: Brain,
  completed: CheckCircle,
  failed: XCircle,
};

const STEP_LABELS: Record<string, string> = {
  loading: "Profiel laden",
  scanning: "Zaken scannen",
  classifying: "AI classificatie",
  detecting: "Signalen detecteren",
  matching: "Matches berekenen",
  summarizing: "AI analyse genereren",
  completed: "Scan voltooid",
  failed: "Scan mislukt",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScanProgress({ jobId, onComplete }: ScanProgressProps) {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/intelligence/scan-status?jobId=${jobId}`);
        if (!res.ok) {
          setError("Kan scan status niet ophalen");
          return;
        }

        const data = await res.json();
        if (!active) return;

        setStatus(data.status);

        if (data.status?.step === "completed" || data.status?.step === "failed") {
          clearInterval(interval);
          if (data.status.step === "completed") {
            onComplete?.();
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId, onComplete]);

  if (!status) {
    return (
      <div className="rounded-xl border border-border bg-muted/50 p-4">
        <div className="flex items-center gap-3">
          <CircleNotch className="h-5 w-5 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Scan wordt gestart...</p>
        </div>
      </div>
    );
  }

  const StepIcon = STEP_ICONS[status.step] ?? CircleNotch;
  const isRunning = !["completed", "failed"].includes(status.step);
  const isFailed = status.step === "failed";
  const isCompleted = status.step === "completed";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        isCompleted && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5",
        isFailed && "border-destructive/30 bg-destructive/5",
        isRunning && "border-primary/30 bg-primary/5",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <StepIcon
          className={cn(
            "h-5 w-5",
            isRunning && "text-primary animate-spin",
            isCompleted && "text-emerald-600 dark:text-emerald-400",
            isFailed && "text-destructive",
          )}
          weight={isCompleted || isFailed ? "fill" : "regular"}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {STEP_LABELS[status.step] ?? status.step}
          </p>
          <p className="text-xs text-muted-foreground truncate">{status.label}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          {status.businessesFound != null && (
            <span>{status.businessesFound} zaken</span>
          )}
          {status.matchesFound != null && (
            <span className="font-medium text-primary">{status.matchesFound} matches</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && status.progress != null && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${Math.min(status.progress, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {status.citiesCompleted != null && status.citiesTotal != null
                ? `Stad ${status.citiesCompleted + 1} van ${status.citiesTotal}`
                : `${status.progress}%`}
            </span>
            {status.city && <span>{status.city}</span>}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

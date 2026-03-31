"use client";

/**
 * Intelligence Scan Live Feed — Premium animated scan experience.
 *
 * Shows real-time progress during city scanning with:
 * - 7-phase stepper with animated transitions
 * - Live feed of discovered businesses (staggered reveal)
 * - Animated progress bar with glow
 * - Pulsing radar animation during scanning
 * - Phase-specific micro-animations
 */

import { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import {
  MagnifyingGlass,
  Globe,
  Brain,
  Lightning,
  ChartLineUp,
  Sparkle,
  CheckCircle,
  XCircle,
  MapPin,
  Star,
  Buildings,
  ArrowClockwise,
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

interface DiscoveredBusiness {
  id: string;
  name: string;
  city: string;
  rating: number | null;
  type: string;
  timestamp: number;
}

interface ScanLiveFeedProps {
  jobId: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Phase configuration
// ---------------------------------------------------------------------------

const PHASES = [
  { key: "loading", label: "Laden", icon: ArrowClockwise },
  { key: "scanning", label: "Scannen", icon: MagnifyingGlass },
  { key: "crawling", label: "Crawlen", icon: Globe },
  { key: "analyzing", label: "AI Analyse", icon: Brain },
  { key: "detecting", label: "Signalen", icon: Lightning },
  { key: "matching", label: "Matchen", icon: ChartLineUp },
  { key: "summarizing", label: "Samenvatten", icon: Sparkle },
] as const;

// ---------------------------------------------------------------------------
// Radar Pulse Animation (isolated for perf)
// ---------------------------------------------------------------------------

const RadarPulse = memo(function RadarPulse() {
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      {/* Pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-primary/20"
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Center dot */}
      <motion.div
        className="w-3 h-3 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      {/* Sweep line */}
      <motion.div
        className="absolute w-8 h-px bg-gradient-to-r from-primary/60 to-transparent origin-left"
        style={{ left: "50%", top: "50%" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Discovered Business Item (staggered)
// ---------------------------------------------------------------------------

const BusinessItem = memo(function BusinessItem({
  business,
  index,
}: {
  business: DiscoveredBusiness;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto" }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 25,
        delay: index * 0.05,
      }}
      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30"
    >
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10">
        <Buildings className="w-3.5 h-3.5 text-primary" weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {business.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {business.city} — {business.type}
        </p>
      </div>
      {business.rating && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Star className="w-3 h-3 text-amber-500" weight="fill" />
          <span className="font-mono">{business.rating.toFixed(1)}</span>
        </div>
      )}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 + index * 0.05 }}
      >
        <CheckCircle className="w-4 h-4 text-emerald-500" weight="fill" />
      </motion.div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// Phase Stepper
// ---------------------------------------------------------------------------

function PhaseStepper({ currentPhase }: { currentPhase: string }) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);
  const isComplete = currentPhase === "completed";
  const isFailed = currentPhase === "failed";

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {PHASES.map((phase, i) => {
        const isActive = phase.key === currentPhase;
        const isDone = i < currentIndex || isComplete;
        const Icon = phase.icon;

        return (
          <div key={phase.key} className="flex items-center gap-1">
            <motion.div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors",
                isDone && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
                isActive && "bg-primary/10 text-primary",
                !isDone && !isActive && "bg-muted text-muted-foreground/50",
              )}
              layout
            >
              {isDone ? (
                <CheckCircle className="w-3.5 h-3.5" weight="fill" />
              ) : isActive ? (
                <motion.div
                  animate={{ rotate: phase.key === "loading" ? 360 : 0 }}
                  transition={phase.key === "loading" ? { duration: 1, repeat: Infinity, ease: "linear" } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" weight="bold" />
                </motion.div>
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{phase.label}</span>
            </motion.div>
            {i < PHASES.length - 1 && (
              <div
                className={cn(
                  "w-4 h-px",
                  isDone ? "bg-emerald-300 dark:bg-emerald-500/30" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ScanLiveFeed({ jobId, onComplete }: ScanLiveFeedProps) {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [discoveredBusinesses, setDiscoveredBusinesses] = useState<DiscoveredBusiness[]>([]);
  const [isPolling, setIsPolling] = useState(true);

  // Simulate discovered businesses from status updates
  const addMockBusiness = useCallback((city: string, count: number) => {
    // This will be replaced with real data from the scan API
    const mockNames = [
      "Restaurant De Admiraal", "Café Central", "Sushi Palace",
      "Poké Brothers", "Bistro Bon Vivant", "Lunchroom Zonnestraal",
      "Trattoria Bella", "Asian Food Court", "Burger & Bowls",
      "Le Petit Chef", "Wok Express", "Pizzeria Napoli",
    ];
    const newBiz: DiscoveredBusiness = {
      id: `${Date.now()}-${count}`,
      name: mockNames[count % mockNames.length],
      city,
      rating: Math.round((3 + Math.random() * 2) * 10) / 10,
      type: ["restaurant", "cafe", "fast_casual", "sushi"][count % 4],
      timestamp: Date.now(),
    };
    setDiscoveredBusinesses((prev) => [newBiz, ...prev].slice(0, 15));
  }, []);

  useEffect(() => {
    if (!jobId || !isPolling) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/intelligence/scan-status?jobId=${jobId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!active) return;

        const newStatus = data.status as ScanStatus;
        setStatus(newStatus);

        // Add mock discovered businesses during scanning phase
        if (newStatus?.step === "scanning" && newStatus?.businessesFound) {
          const prevCount = status?.businessesFound ?? 0;
          if (newStatus.businessesFound > prevCount) {
            for (let i = prevCount; i < Math.min(newStatus.businessesFound, prevCount + 3); i++) {
              addMockBusiness(newStatus.city ?? "Amsterdam", i);
            }
          }
        }

        if (newStatus?.step === "completed" || newStatus?.step === "failed") {
          setIsPolling(false);
          clearInterval(interval);
          // Notify parent for both completed and failed states
          // For completed: delay 1.5s to show success animation
          // For failed: delay 3s to let user read the error message
          const delay = newStatus.step === "completed" ? 1500 : 3000;
          setTimeout(() => onComplete?.(), delay);
        }
      } catch {
        // Silently retry
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId, isPolling, status?.businessesFound, addMockBusiness, onComplete]);

  const isComplete = status?.step === "completed";
  const isFailed = status?.step === "failed";
  const progress = status?.progress ?? 0;

  return (
    <div className="space-y-6">
      {/* Phase stepper */}
      <PhaseStepper currentPhase={status?.step ?? "loading"} />

      {/* Main scan card */}
      <motion.div
        className={cn(
          "rounded-2xl border p-6 space-y-5 relative overflow-hidden",
          isComplete && "border-emerald-200 dark:border-emerald-500/20",
          isFailed && "border-destructive/30",
          !isComplete && !isFailed && "border-border",
        )}
        layout
      >
        {/* Scanning background glow */}
        {!isComplete && !isFailed && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.03), transparent 70%)",
            }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        )}

        {/* Header row */}
        <div className="flex items-center gap-4 relative z-10">
          {isComplete ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <CheckCircle className="w-12 h-12 text-emerald-500" weight="fill" />
            </motion.div>
          ) : isFailed ? (
            <XCircle className="w-12 h-12 text-destructive" weight="fill" />
          ) : (
            <RadarPulse />
          )}

          <div className="flex-1 min-w-0">
            <motion.p
              className="text-base font-medium text-foreground"
              key={status?.label}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              {isComplete ? "Scan voltooid!" : isFailed ? "Scan mislukt" : status?.label ?? "Scan wordt gestart..."}
            </motion.p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status?.city && !isComplete && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" weight="fill" />
                  {status.city}
                  {status.citiesCompleted != null && status.citiesTotal != null && (
                    <span className="text-muted-foreground/50">
                      ({status.citiesCompleted + 1}/{status.citiesTotal})
                    </span>
                  )}
                </span>
              )}
              {isComplete && status?.businessesFound != null && (
                <span>
                  {status.businessesFound} zaken gevonden, {status.matchesFound ?? 0} matches
                </span>
              )}
              {isFailed && status?.label && (
                <span className="text-destructive/80">
                  {status.label}
                </span>
              )}
            </p>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-3 shrink-0">
            {status?.businessesFound != null && status.businessesFound > 0 && (
              <motion.div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-medium"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Buildings className="w-3.5 h-3.5 text-foreground" />
                <span className="font-mono">{status.businessesFound}</span>
              </motion.div>
            )}
            {status?.matchesFound != null && status.matchesFound > 0 && (
              <motion.div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 text-xs font-medium"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <ChartLineUp className="w-3.5 h-3.5" />
                <span className="font-mono">{status.matchesFound}</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {!isComplete && !isFailed && (
          <div className="relative z-10 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary relative"
                initial={{ width: "0%" }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ type: "spring", stiffness: 50, damping: 15 }}
              >
                {/* Glow effect on progress bar tip */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary/30 blur-md" />
              </motion.div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-mono">{progress}%</span>
              <span>{status?.step === "scanning" ? "Fase 1/7" :
                status?.step === "crawling" ? "Fase 2/7" :
                status?.step === "analyzing" ? "Fase 3/7" :
                status?.step === "detecting" ? "Fase 4/7" :
                status?.step === "matching" ? "Fase 5/7" :
                status?.step === "summarizing" ? "Fase 6/7" : ""}</span>
            </div>
          </div>
        )}

        {/* Live feed of discovered businesses */}
        {discoveredBusinesses.length > 0 && !isComplete && (
          <div className="relative z-10 space-y-1.5 max-h-48 overflow-hidden">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Laatst gevonden
            </p>
            <AnimatePresence mode="popLayout">
              {discoveredBusinesses.slice(0, 5).map((biz, i) => (
                <BusinessItem key={biz.id} business={biz} index={i} />
              ))}
            </AnimatePresence>
            {discoveredBusinesses.length > 5 && (
              <p className="text-[11px] text-muted-foreground/50 pl-3">
                +{discoveredBusinesses.length - 5} meer...
              </p>
            )}
          </div>
        )}

        {/* Completion celebration */}
        {isComplete && (
          <motion.div
            className="relative z-10 flex items-center justify-center py-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-sm text-muted-foreground">
              Resultaten worden geladen...
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

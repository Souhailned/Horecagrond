"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/app/actions/portfolio-summary";
import {
  Heartbeat,
  Warning,
  Fire,
  ChartLineUp,
  ChartLineDown,
  CaretDown,
  Minus,
} from "@phosphor-icons/react/dist/ssr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioSummaryWidgetProps {
  initialSummary: PortfolioSummary | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "panden-summary-collapsed";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function TrendIndicator({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="size-3" weight="bold" />
        <span className="text-[10px]">0%</span>
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
        <ChartLineUp className="size-3" weight="bold" />
        <span className="text-[10px]">+{value}%</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-destructive">
      <ChartLineDown className="size-3" weight="bold" />
      <span className="text-[10px]">{value}%</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat Item (inline divider strip)
// ---------------------------------------------------------------------------

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  extra?: React.ReactNode;
  href?: string;
}

function StatItem({ icon, label, value, subtitle, extra, href }: StatItemProps) {
  const content = (
    <div className="flex-1 px-4 py-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="flex-1 transition-colors hover:bg-muted/30">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </Link>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export function PortfolioSummaryWidget({
  initialSummary,
}: PortfolioSummaryWidgetProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? stored === "true" : false;
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  // Nothing to show if data failed to load
  if (!initialSummary) return null;

  const s = initialSummary;
  const attentionTotal =
    s.staleCount + s.lowScoreCount + s.missingDescriptionCount;

  // Build attention subtitle parts
  const attentionParts: string[] = [];
  if (s.staleCount > 0) attentionParts.push(`${s.staleCount} verouderd`);
  if (s.missingDescriptionCount > 0)
    attentionParts.push(`${s.missingDescriptionCount} zonder tekst`);
  if (s.lowScoreCount > 0)
    attentionParts.push(`${s.lowScoreCount} lage score`);
  const attentionSubtitle =
    attentionParts.length > 0
      ? attentionParts.slice(0, 2).join(", ")
      : "Alles op orde";

  return (
    <div className="border-b border-border">
      {/* Toggle header */}
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
        aria-expanded={!collapsed}
        aria-controls="portfolio-summary-content"
      >
        <span className="text-xs font-medium text-muted-foreground">
          Portfolio overzicht
        </span>
        <CaretDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200",
            collapsed && "-rotate-90"
          )}
          weight="bold"
        />
      </button>

      {/* Collapsible content */}
      <div
        id="portfolio-summary-content"
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          collapsed ? "max-h-0" : "max-h-[500px]"
        )}
      >
        <div className="grid grid-cols-2 divide-y divide-border sm:flex sm:divide-x sm:divide-y-0">
          {/* 1. Gezondheid */}
          <StatItem
            icon={
              <Heartbeat
                className="size-3.5 text-emerald-600 dark:text-emerald-400"
                weight="fill"
              />
            }
            label="Gezondheid"
            value={s.avgHealthScore !== null ? String(s.avgHealthScore) : "--"}
            subtitle={`${s.activeProperties} actieve panden`}
          />

          {/* 2. Aandacht nodig */}
          <StatItem
            icon={
              <Warning
                className="size-3.5 text-amber-600 dark:text-amber-400"
                weight="fill"
              />
            }
            label="Aandacht nodig"
            value={String(attentionTotal)}
            subtitle={attentionSubtitle}
          />

          {/* 3. Leads */}
          <StatItem
            icon={
              <Fire
                className="size-3.5 text-destructive"
                weight="fill"
              />
            }
            label="Leads"
            value={String(s.hotLeadCount)}
            subtitle={`+${s.warmLeadCount} warm`}
            href="/dashboard/leads"
          />

          {/* 4. Prestatie */}
          <StatItem
            icon={
              s.viewsTrend >= 0 ? (
                <ChartLineUp
                  className="size-3.5 text-primary"
                  weight="bold"
                />
              ) : (
                <ChartLineDown
                  className="size-3.5 text-destructive"
                  weight="bold"
                />
              )
            }
            label="Prestatie"
            value={formatCompact(s.totalViews)}
            subtitle={`${s.totalInquiries} aanvragen`}
            extra={<TrendIndicator value={s.viewsTrend} />}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { HealthScoreBreakdown } from "@/lib/property-health";

interface HealthScoreBadgeProps {
  score: number | null;
  breakdown?: HealthScoreBreakdown | null;
  size?: "sm" | "md";
}

/**
 * Compact circular SVG badge displaying a property's health score (0-100).
 * Shows a colored ring proportional to the score with a tooltip breakdown.
 */
export function HealthScoreBadge({
  score,
  breakdown,
  size = "sm",
}: HealthScoreBadgeProps) {
  const diameter = size === "sm" ? 28 : 36;
  const strokeWidth = size === "sm" ? 2.5 : 3;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fontSize = size === "sm" ? 9 : 11;

  // Score is null — show placeholder
  if (score === null) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          size === "sm" ? "h-7 w-7" : "h-9 w-9"
        )}
      >
        <svg
          width={diameter}
          height={diameter}
          viewBox={`0 0 ${diameter} ${diameter}`}
        >
          {/* Background ring */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            className="stroke-muted"
            strokeWidth={strokeWidth}
          />
          {/* Placeholder text */}
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            className="fill-muted-foreground"
            fontWeight={600}
          >
            --
          </text>
        </svg>
      </div>
    );
  }

  // Determine color tier
  const colorClass =
    score >= 70
      ? "text-emerald-500"
      : score >= 40
        ? "text-amber-500"
        : "text-destructive";

  const strokeColorClass =
    score >= 70
      ? "stroke-emerald-500"
      : score >= 40
        ? "stroke-amber-500"
        : "stroke-destructive";

  const fillColorClass =
    score >= 70
      ? "fill-emerald-500"
      : score >= 40
        ? "fill-amber-500"
        : "fill-destructive";

  const dashOffset = circumference - (score / 100) * circumference;

  const badge = (
    <div
      className={cn(
        "flex items-center justify-center",
        size === "sm" ? "h-7 w-7" : "h-9 w-9"
      )}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Background ring */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={strokeWidth}
        />
        {/* Score ring */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          className={cn(strokeColorClass, "transition-all duration-500")}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
        {/* Score text — rotated back to be upright */}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          className={cn(fillColorClass, "rotate-90 origin-center")}
          fontWeight={700}
        >
          {score}
        </text>
      </svg>
    </div>
  );

  // If breakdown is available, wrap in tooltip
  if (breakdown) {
    const tooltipLabel = [
      `Content: ${breakdown.content}/25`,
      `Kwaliteit: ${breakdown.quality}/25`,
      `Prestatie: ${breakdown.performance}/25`,
      `Prijs: ${breakdown.price}/15`,
      `Versheid: ${breakdown.freshness}/10`,
    ].join(" | ");

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Gezondheidscore: ${score}`}
            className={cn(
              "cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded",
              colorClass
            )}
          >
            {badge}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <span className="text-xs">{tooltipLabel}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}

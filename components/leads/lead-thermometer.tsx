"use client";

import { cn } from "@/lib/utils";
import { getTemperatureColor, getTemperatureBg, type LeadScore } from "@/lib/lead-scoring";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Fire, Thermometer, Snowflake, Lightbulb } from "@phosphor-icons/react/dist/ssr";

const tempIcons: Record<string, typeof Fire> = {
  hot: Fire,
  warm: Thermometer,
  cold: Snowflake,
};

interface LeadThermometerProps {
  score: LeadScore;
  compact?: boolean;
}

export function LeadThermometer({ score, compact = false }: LeadThermometerProps) {
  const TempIcon = tempIcons[score.temperature] || Thermometer;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                getTemperatureBg(score.temperature),
                getTemperatureColor(score.temperature)
              )}
            >
              <TempIcon className="h-3 w-3" weight="fill" />
              <span>{score.score}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium">
              {score.label} lead — {score.score}/100
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {score.suggestedAction}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-xl border border-border bg-background",
              getTemperatureColor(score.temperature)
            )}
          >
            <TempIcon className="h-5 w-5" weight="fill" />
          </div>
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                getTemperatureColor(score.temperature)
              )}
            >
              {score.label} lead
            </p>
            <p className="text-xs text-muted-foreground">
              Score: {score.score}/100
            </p>
          </div>
        </div>
        {/* Visual bar */}
        <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", {
              "bg-red-500": score.temperature === "hot",
              "bg-amber-500": score.temperature === "warm",
              "bg-blue-400": score.temperature === "cold",
            })}
            style={{ width: `${score.score}%` }}
          />
        </div>
      </div>

      {/* Factors breakdown */}
      <div className="space-y-2">
        {score.factors.map((factor) => (
          <div
            key={factor.name}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-muted-foreground w-36 shrink-0">
              {factor.name}
            </span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="w-20 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/50"
                  style={{
                    width: `${(factor.points / factor.maxPoints) * 100}%`,
                  }}
                />
              </div>
              <span className="text-muted-foreground w-8 text-right font-medium tabular-nums">
                {factor.points}/{factor.maxPoints}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Suggested action */}
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-start gap-2">
          <Lightbulb
            className="h-4 w-4 text-amber-500 shrink-0 mt-0.5"
            weight="fill"
          />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
              Aanbevolen actie
            </p>
            <p className="text-sm text-foreground">{score.suggestedAction}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

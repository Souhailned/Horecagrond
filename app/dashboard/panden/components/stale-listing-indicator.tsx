"use client";

import { useState, useCallback } from "react";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getStaleListingAdvice,
  type StaleListingAdvice,
} from "@/app/actions/ai-quick-actions";

interface StaleListingIndicatorProps {
  propertyId: string;
  daysOnline: number;
  inquiryCount: number;
}

const IMPACT_STYLES: Record<
  StaleListingAdvice["suggestions"][number]["impact"],
  string
> = {
  hoog: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  midden: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  laag: "bg-muted text-muted-foreground border-border",
};

/**
 * Warning indicator for stale listings (60+ days online with low inquiries).
 * On click, opens a popover that lazy-loads AI advice for improving the listing.
 */
export function StaleListingIndicator({
  propertyId,
  daysOnline,
  inquiryCount,
}: StaleListingIndicatorProps) {
  const [advice, setAdvice] = useState<StaleListingAdvice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchAdvice = useCallback(async () => {
    // Only fetch once — cache in component state
    if (hasFetched) return;
    setHasFetched(true);
    setIsLoading(true);
    setError(null);

    try {
      const result = await getStaleListingAdvice(propertyId);
      if (result.success && result.data) {
        setAdvice(result.data);
      } else {
        setError(result.error ?? "Kon advies niet laden");
      }
    } catch {
      setError("Kon advies niet laden");
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, hasFetched]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={fetchAdvice}
          className={cn(
            "inline-flex items-center justify-center",
            "rounded-full p-0.5",
            "text-amber-500 hover:text-amber-600 transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          aria-label={`Verouderd pand advies - ${daysOnline} dagen online`}
        >
          <Warning
            className="size-3.5 animate-pulse"
            weight="fill"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">
            Advies voor verouderde vermelding
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {daysOnline} dagen online
            {inquiryCount === 0
              ? " zonder aanvragen"
              : ` met ${inquiryCount} aanvra${inquiryCount === 1 ? "ag" : "gen"}`}
          </p>
        </div>

        {/* Content */}
        <div className="px-3 py-2.5 space-y-2.5">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {advice && (
            <>
              {/* Diagnosis */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {advice.diagnosis}
              </p>

              {/* Suggestions */}
              <ul className="space-y-1.5">
                {advice.suggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-px shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                          IMPACT_STYLES[suggestion.impact]
                        )}
                      >
                        {suggestion.impact}
                      </span>
                    </span>
                    <span className="text-xs text-foreground leading-relaxed">
                      {suggestion.action}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { cn } from "@/lib/utils";

interface StatusFilterChipsProps {
  activeFilter: string;
  onFilterChange: (status: string) => void;
  statusCounts: Record<string, number>;
}

const STATUS_CHIPS = [
  { key: "ALL", label: "Alle" },
  { key: "DRAFT", label: "Concept" },
  { key: "ACTIVE", label: "Actief" },
  { key: "UNDER_OFFER", label: "Onder bod" },
  { key: "RENTED", label: "Verhuurd" },
  { key: "SOLD", label: "Verkocht" },
  { key: "ARCHIVED", label: "Gearchiveerd" },
] as const;

const STATUS_DOT_COLORS: Record<string, string> = {
  DRAFT: "bg-muted-foreground/50",
  ACTIVE: "bg-emerald-500",
  UNDER_OFFER: "bg-amber-500",
  RENTED: "bg-sky-500",
  SOLD: "bg-sky-500",
  ARCHIVED: "bg-muted-foreground/30",
  PENDING_REVIEW: "bg-amber-500",
  REJECTED: "bg-destructive",
};

export function StatusFilterChips({
  activeFilter,
  onFilterChange,
  statusCounts,
}: StatusFilterChipsProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {STATUS_CHIPS.map(({ key, label }) => {
        const isActive = activeFilter === key;
        const count = statusCounts[key] ?? 0;
        const dotColor = STATUS_DOT_COLORS[key];

        return (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
              isActive
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {key !== "ALL" && dotColor && (
              <span
                className={cn("inline-block size-1.5 rounded-full", dotColor)}
              />
            )}
            {label}
            {count > 0 && (
              <span
                className={cn(
                  "ml-0.5 text-[10px]",
                  isActive
                    ? "text-background/70"
                    : "text-muted-foreground/60"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

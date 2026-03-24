"use client";

import { useCallback } from "react";
import { MagnifyingGlass, X, Table, List, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusFilterChips } from "./status-filter-chips";

type ViewMode = "table" | "list" | "grid";

interface PandenToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  statusCounts: Record<string, number>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  isAdmin: boolean;
  scope: "all" | "mine";
  onScopeChange: (scope: "all" | "mine") => void;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Nieuwste" },
  { value: "oldest", label: "Oudste" },
  { value: "price_high", label: "Prijs (hoog-laag)" },
  { value: "price_low", label: "Prijs (laag-hoog)" },
  { value: "views", label: "Meeste views" },
  { value: "inquiries", label: "Meeste aanvragen" },
  { value: "health", label: "Health score" },
] as const;

export function PandenToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  isAdmin,
  scope,
  onScopeChange,
}: PandenToolbarProps) {
  const handleViewModeChange = useCallback(
    (value: string) => {
      if (value) {
        onViewModeChange(value as ViewMode);
      }
    },
    [onViewModeChange]
  );

  const handleScopeChange = useCallback(
    (value: string) => {
      if (value) {
        onScopeChange(value as "all" | "mine");
      }
    },
    [onScopeChange]
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Row 1: Search + controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {/* Search input */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm",
            "focus-within:ring-1 focus-within:ring-ring",
            "flex-1 sm:max-w-64"
          )}
        >
          <MagnifyingGlass className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Zoek op naam of stad..."
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Admin scope toggle */}
          {isAdmin && (
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={handleScopeChange}
              size="sm"
            >
              <ToggleGroupItem value="mine" className="px-2.5 text-xs">
                Mijn panden
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="px-2.5 text-xs">
                Alle panden
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger size="sm" className="h-8 text-xs">
              <SelectValue placeholder="Sorteren" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View mode toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={handleViewModeChange}
            size="sm"
          >
            <ToggleGroupItem value="table" aria-label="Tabel weergave">
              <Table className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Lijst weergave">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid weergave">
              <SquaresFour className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Row 2: Status filter chips */}
      <StatusFilterChips
        activeFilter={statusFilter}
        onFilterChange={onStatusFilterChange}
        statusCounts={statusCounts}
      />
    </div>
  );
}

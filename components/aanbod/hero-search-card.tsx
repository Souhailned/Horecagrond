"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Map,
  UtensilsCrossed,
  Coffee,
  Wine,
  Hotel,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertyType, PropertyTypeLabels } from "@/types/property";
import { SearchBar } from "@/components/search/search-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// ── Tab definitions ─────────────────────────────────────────────────
interface CategoryTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  types: PropertyType[];
}

const CATEGORY_TABS: CategoryTab[] = [
  { id: "all", label: "Alles", icon: LayoutGrid, types: [] },
  { id: "restaurant", label: "Restaurant", icon: UtensilsCrossed, types: ["RESTAURANT"] },
  {
    id: "cafe",
    label: "Caf\u00e9",
    icon: Coffee,
    types: ["CAFE", "EETCAFE", "GRAND_CAFE", "BROUWERIJ_CAFE", "KOFFIEBAR"],
  },
  {
    id: "bar",
    label: "Bar",
    icon: Wine,
    types: ["BAR", "COCKTAILBAR", "WIJNBAR"],
  },
  {
    id: "hotel",
    label: "Hotel",
    icon: Hotel,
    types: ["HOTEL", "HOTEL_RESTAURANT", "BED_AND_BREAKFAST"],
  },
];

// Types shown in the main tabs (flattened)
const TABBED_TYPES = new Set(CATEGORY_TABS.flatMap((t) => t.types));

// Remaining types for the "Meer" dropdown
const MORE_TYPES: PropertyType[] = (
  Object.keys(PropertyTypeLabels) as PropertyType[]
).filter((t) => !TABBED_TYPES.has(t));

// ── Helpers ─────────────────────────────────────────────────────────

/** Determine which tab is active based on URL `types` param */
function detectActiveTab(typesParam: string | null): string {
  if (!typesParam) return "all";

  const activeTypes = new Set(typesParam.split(",").filter(Boolean));

  for (const tab of CATEGORY_TABS) {
    if (tab.types.length === 0) continue;
    if (
      tab.types.length === activeTypes.size &&
      tab.types.every((t) => activeTypes.has(t))
    ) {
      return tab.id;
    }
  }

  if (activeTypes.size === 1) {
    const single = [...activeTypes][0] as PropertyType;
    if (MORE_TYPES.includes(single)) return `more-${single}`;
  }

  return "all";
}

/** Build the new URL preserving other filters */
function buildTabUrl(
  types: PropertyType[],
  currentParams: URLSearchParams
): string {
  const params = new URLSearchParams(currentParams.toString());
  params.delete("page");

  if (types.length === 0) {
    params.delete("types");
  } else {
    params.set("types", types.join(","));
  }

  const qs = params.toString();
  return qs ? `/aanbod?${qs}` : "/aanbod";
}

// ── Component ───────────────────────────────────────────────────────

interface HeroSearchCardProps {
  popularCities: string[];
  totalCount: number;
  /** Add staggered entrance animations */
  animated?: boolean;
  /** Base delay (ms) before the card starts animating */
  animationDelay?: number;
}

export function HeroSearchCard({
  popularCities,
  totalCount,
  animated = false,
  animationDelay = 0,
}: HeroSearchCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = detectActiveTab(searchParams.get("types"));

  const handleTabClick = (tab: CategoryTab) => {
    const url = buildTabUrl(tab.types, searchParams);
    router.push(url);
  };

  const handleMoreClick = (type: PropertyType) => {
    const url = buildTabUrl([type], searchParams);
    router.push(url);
  };

  const handleCityClick = (city: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cities", city);
    params.delete("page");
    router.push(`/aanbod?${params.toString()}`);
  };

  // Animation base classes
  const fadeUp = animated
    ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 [animation-fill-mode:both]"
    : "";

  return (
    <div className="flex flex-col gap-4">
      {/* ── Main card ─────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md",
          fadeUp
        )}
        style={animated ? { animationDelay: `${animationDelay}ms` } : undefined}
      >
        {/* Category tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/40 px-2 pt-2 sm:px-4 sm:pt-3 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 sm:px-4 sm:py-3",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isActive && "scale-110"
                  )}
                />
                <span>{tab.label}</span>
                {/* Active indicator — animated sliding bar */}
                <span
                  className={cn(
                    "absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary transition-all duration-300",
                    isActive
                      ? "scale-x-100 opacity-100"
                      : "scale-x-0 opacity-0"
                  )}
                />
              </button>
            );
          })}

          {/* "Meer" dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "group relative flex shrink-0 items-center gap-1 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 sm:px-4 sm:py-3",
                  activeTab.startsWith("more-")
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span>Meer</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                <span
                  className={cn(
                    "absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary transition-all duration-300",
                    activeTab.startsWith("more-")
                      ? "scale-x-100 opacity-100"
                      : "scale-x-0 opacity-0"
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 w-56 overflow-y-auto"
            >
              {MORE_TYPES.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => handleMoreClick(type)}
                  className={cn(
                    "cursor-pointer",
                    activeTab === `more-${type}` && "bg-accent font-medium"
                  )}
                >
                  {PropertyTypeLabels[type]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search bar + map button */}
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <SearchBar
            size="lg"
            className="flex-1"
            placeholder="Zoek op stad, type of pandnaam..."
          />
          <Button
            variant="outline"
            size="lg"
            className="hidden shrink-0 gap-2 sm:inline-flex"
            asChild
          >
            <Link href="/aanbod?view=map">
              <Map className="h-4 w-4" />
              Kaart
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Popular cities ────────────────────────────────────── */}
      <div
        className={cn("flex flex-wrap items-center gap-2", fadeUp)}
        style={
          animated
            ? { animationDelay: `${animationDelay + 120}ms` }
            : undefined
        }
      >
        <span className="text-xs font-medium text-muted-foreground">
          Populair:
        </span>
        {popularCities.slice(0, 6).map((city, i) => (
          <button
            key={city}
            onClick={() => handleCityClick(city)}
            className={cn(
              "rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium",
              "transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-foreground hover:-translate-y-px hover:shadow-sm",
              "text-muted-foreground",
              searchParams.get("cities") === city &&
                "border-primary/40 bg-primary/10 text-primary",
              animated && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 [animation-fill-mode:both]"
            )}
            style={
              animated
                ? { animationDelay: `${animationDelay + 200 + i * 60}ms` }
                : undefined
            }
          >
            {city}
          </button>
        ))}
        <span className="ml-1 text-xs text-muted-foreground">
          {totalCount} {totalCount === 1 ? "pand" : "panden"} beschikbaar
        </span>
      </div>
    </div>
  );
}

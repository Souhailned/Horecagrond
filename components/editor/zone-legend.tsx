"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSceneMeasurements } from "@/lib/editor/systems";
import { ZONE_COLORS, ZONE_LABELS } from "@/lib/editor/schema";
import { useEditorColors, type EditorColors } from "@/lib/editor/theme";
import { cn } from "@/lib/utils";

const ZONE_TYPE_TO_COLOR_KEY: Record<string, keyof EditorColors> = {
  dining_area: "zoneDining",
  bar_area: "zoneBar",
  kitchen: "zoneKitchen",
  storage: "zoneStorage",
  terrace: "zoneTerrace",
  entrance: "zoneEntrance",
  restroom: "zoneRestroom",
  office: "zoneOffice",
  prep_area: "zonePrepArea",
  walk_in_cooler: "zoneWalkInCooler",
  seating_outside: "zoneSeatingOutside",
  hallway: "zoneHallway",
};

export function ZoneLegend() {
  const colors = useEditorColors();
  const { zones, totalArea, wallCount, itemCount } = useSceneMeasurements();
  const [expanded, setExpanded] = useState(false);

  if (zones.length === 0 && wallCount === 0 && itemCount === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-background/90 shadow-sm backdrop-blur-sm">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-accent/50 rounded-md transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Zone color dots (compact) */}
          <div className="flex -space-x-0.5">
            {zones.slice(0, 4).map((zone) => (
              <span
                key={zone.id}
                className="inline-block size-2 rounded-full ring-1 ring-background"
                style={{
                  backgroundColor:
                    colors[ZONE_TYPE_TO_COLOR_KEY[zone.zoneType]] ??
                    ZONE_COLORS[zone.zoneType] ??
                    "#999",
                }}
              />
            ))}
          </div>
          <span className="text-[11px] font-medium text-foreground">
            {totalArea.toFixed(0)}m² · {wallCount}W · {itemCount}I
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="size-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-1.5">
          {zones.map((zone) => (
            <div key={zone.id} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    colors[ZONE_TYPE_TO_COLOR_KEY[zone.zoneType]] ??
                    ZONE_COLORS[zone.zoneType] ??
                    "#999",
                }}
              />
              <span className="flex-1 truncate text-foreground">
                {ZONE_LABELS[zone.zoneType]}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {zone.area.toFixed(0)}m²
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

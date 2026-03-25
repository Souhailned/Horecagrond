"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/editor/stores";
import { ITEM_DEFAULTS } from "@/lib/editor/schema";
import type { HorecaItemType } from "@/lib/editor/schema";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ItemCategory = "meubilair" | "keuken" | "bar" | "terras" | "overig";

const CATEGORIES: {
  id: ItemCategory;
  label: string;
  items: HorecaItemType[];
}[] = [
  {
    id: "meubilair",
    label: "Meubilair",
    items: ["table_round", "table_square", "table_long", "chair", "booth"],
  },
  {
    id: "keuken",
    label: "Keuken",
    items: [
      "kitchen_counter",
      "oven",
      "stove",
      "fridge",
      "sink",
      "coffee_machine",
    ],
  },
  {
    id: "bar",
    label: "Bar",
    items: ["bar_counter", "barstool", "display_case", "register"],
  },
  {
    id: "terras",
    label: "Terras",
    items: ["parasol", "planter"],
  },
  {
    id: "overig",
    label: "Overig",
    items: [], // catch-all for any items not in other categories
  },
];

export function AssetPanel() {
  const [activeCategory, setActiveCategory] =
    useState<ItemCategory>("meubilair");
  const startPlacingItem = useEditorStore((s) => s.startPlacingItem);
  const placingItemType = useEditorStore((s) => s.placingItemType);

  const category = CATEGORIES.find((c) => c.id === activeCategory)!;

  return (
    <div className="flex h-full w-[200px] flex-col border-r border-border bg-background">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Inventaris</h2>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
        {CATEGORIES.filter((c) => c.items.length > 0).map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Items grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-1.5 p-2">
          {category.items.map((itemType) => {
            const def = ITEM_DEFAULTS[itemType];
            const isActive = placingItemType === itemType;

            return (
              <button
                key={itemType}
                onClick={() => startPlacingItem(itemType)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border border-border p-2 text-center transition-colors hover:bg-accent",
                  isActive &&
                    "border-primary bg-primary/10 ring-1 ring-primary",
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                  {def.width.toFixed(1)}m
                </div>
                <span className="text-[10px] leading-tight text-foreground">
                  {def.label}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {def.width}&times;{def.depth}m
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// @ts-nocheck
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FEATURE_CATEGORIES, type PropertyWizardData } from "../types";
import {
  FileCheck,
  Building2,
  Plug,
  Check,
} from "lucide-react";

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  FileCheck,
  Building: Building2,
  Plug,
};

interface StepFeaturesProps {
  data: PropertyWizardData;
  onUpdate: (updates: Partial<PropertyWizardData>) => void;
}

export function StepFeatures({ data, onUpdate }: StepFeaturesProps) {
  const toggleFeature = (key: string, checked: boolean) => {
    onUpdate({
      features: {
        ...data.features,
        [key]: checked,
      },
    });
  };

  const selectedCount = Object.values(data.features).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header with selection count */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Kenmerken en Voorzieningen</h3>
          <p className="text-sm text-muted-foreground">
            Selecteer alle kenmerken die van toepassing zijn op dit pand
          </p>
        </div>
        {selectedCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            {selectedCount} geselecteerd
          </Badge>
        )}
      </div>

      {/* Feature Categories */}
      <div className="space-y-6">
        {(Object.entries(FEATURE_CATEGORIES) as [keyof typeof FEATURE_CATEGORIES, typeof FEATURE_CATEGORIES[keyof typeof FEATURE_CATEGORIES]][]).map(
          ([categoryKey, category]) => {
            const Icon = categoryIcons[category.icon] || FileCheck;
            const selectedInCategory = category.features.filter(
              (f) => data.features[f.key]
            ).length;

            return (
              <div
                key={categoryKey}
                className="rounded-xl border bg-card overflow-hidden"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-medium">{category.label}</span>
                  </div>
                  {selectedInCategory > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {selectedInCategory}/{category.features.length}
                    </Badge>
                  )}
                </div>

                {/* Features Grid */}
                <div className="grid gap-1 p-2 sm:grid-cols-2">
                  {category.features.map((feature) => {
                    const isChecked = data.features[feature.key] || false;

                    return (
                      <Label
                        key={feature.key}
                        htmlFor={feature.key}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors",
                          isChecked
                            ? "bg-primary/5 text-foreground"
                            : "hover:bg-muted/50 text-muted-foreground"
                        )}
                      >
                        <Checkbox
                          id={feature.key}
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            toggleFeature(feature.key, checked === true)
                          }
                        />
                        <span
                          className={cn(
                            "text-sm transition-colors",
                            isChecked && "font-medium text-foreground"
                          )}
                        >
                          {feature.label}
                        </span>
                      </Label>
                    );
                  })}
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const allFeatures: Record<string, boolean> = {};
            Object.values(FEATURE_CATEGORIES).forEach((cat) => {
              cat.features.forEach((f) => {
                allFeatures[f.key] = true;
              });
            });
            onUpdate({ features: allFeatures });
          }}
          className="text-xs text-primary hover:underline"
        >
          Alles selecteren
        </button>
        <span className="text-muted-foreground">•</span>
        <button
          type="button"
          onClick={() => onUpdate({ features: {} })}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Alles deselecteren
        </button>
      </div>

      {/* Feature Tips */}
      <div className="rounded-lg bg-primary/5 p-4">
        <h4 className="text-sm font-medium text-primary">Tip</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Vergunningen zijn belangrijke beslisfactoren voor horecaondernemers.
          Zorg dat u alle relevante vergunningen vermeldt om de juiste
          geïnteresseerden aan te trekken.
        </p>
      </div>
    </div>
  );
}

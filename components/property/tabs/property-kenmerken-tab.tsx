"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2,
  CheckCircle2,
  Loader2,
  Save,
  Shield,
  Wrench,
  Zap,
  Accessibility,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { updatePropertyFeatures } from "@/app/actions/property";
import type { Property, PropertyFeature, FeatureCategory } from "@/lib/validations/property";
import {
  featureCategoryLabels,
  availableFeatures,
} from "@/lib/validations/property";
import { cn } from "@/lib/utils";

interface PropertyKenmerkenTabProps {
  property: Property;
}

// Category icons
const categoryIcons: Record<FeatureCategory, React.ComponentType<{ className?: string }>> = {
  LICENSE: Shield,
  FACILITY: Wrench,
  UTILITY: Zap,
  ACCESSIBILITY: Accessibility,
};

// Category colors
const categoryColors: Record<FeatureCategory, string> = {
  LICENSE: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  FACILITY: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  UTILITY: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950",
  ACCESSIBILITY: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
};

export function PropertyKenmerkenTab({ property }: PropertyKenmerkenTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [features, setFeatures] = useState<PropertyFeature[]>(
    (property.features || []) as unknown as PropertyFeature[]
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "LICENSE",
    "FACILITY",
  ]);

  // Get feature value
  const getFeatureValue = (key: string): PropertyFeature | undefined => {
    return features.find((f) => f.key === key);
  };

  // Check if feature is enabled
  const isFeatureEnabled = (key: string): boolean => {
    const feature = getFeatureValue(key);
    return feature?.booleanValue === true;
  };

  // Get feature string/number value
  const getFeatureStringValue = (key: string): string => {
    const feature = getFeatureValue(key);
    return feature?.value || "";
  };

  const getFeatureNumericValue = (key: string): number | undefined => {
    const feature = getFeatureValue(key);
    return feature?.numericValue;
  };

  // Toggle boolean feature
  const toggleFeature = (
    category: FeatureCategory,
    key: string,
    enabled: boolean
  ) => {
    setHasChanges(true);

    if (enabled) {
      // Add or update feature
      const existingIndex = features.findIndex((f) => f.key === key);
      if (existingIndex >= 0) {
        const updated = [...features];
        updated[existingIndex] = {
          ...updated[existingIndex],
          booleanValue: true,
        };
        setFeatures(updated);
      } else {
        setFeatures([
          ...features,
          {
            id: `feat-${Date.now()}-${key}`,
            propertyId: property.id,
            category,
            key,
            booleanValue: true,
            verified: false,
            displayOrder: features.filter((f) => f.category === category).length,
            highlighted: false,
          },
        ]);
      }
    } else {
      // Remove feature
      setFeatures(features.filter((f) => f.key !== key));
    }
  };

  // Update string/number value
  const updateFeatureValue = (
    category: FeatureCategory,
    key: string,
    value: string | number,
    type: "string" | "number"
  ) => {
    setHasChanges(true);

    const existingIndex = features.findIndex((f) => f.key === key);
    if (existingIndex >= 0) {
      const updated = [...features];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...(type === "string" ? { value: value as string } : { numericValue: value as number }),
      };
      setFeatures(updated);
    } else {
      setFeatures([
        ...features,
        {
          id: `feat-${Date.now()}-${key}`,
          propertyId: property.id,
          category,
          key,
          ...(type === "string" ? { value: value as string } : { numericValue: value as number }),
          verified: false,
          displayOrder: features.filter((f) => f.category === category).length,
          highlighted: false,
        },
      ]);
    }
  };

  // Toggle highlighted status
  const toggleHighlighted = (key: string) => {
    setHasChanges(true);
    const updated = features.map((f) =>
      f.key === key ? { ...f, highlighted: !f.highlighted } : f
    );
    setFeatures(updated);
  };

  // Remove feature
  const removeFeature = (key: string) => {
    setHasChanges(true);
    setFeatures(features.filter((f) => f.key !== key));
  };

  // Save features
  const saveFeatures = () => {
    startTransition(async () => {
      const result = await updatePropertyFeatures(property.id, features);
      if (result.success) {
        toast.success("Kenmerken opgeslagen");
        setHasChanges(false);
        router.refresh();
      } else {
        toast.error(result.error || "Opslaan mislukt");
      }
    });
  };

  // Get active features count per category
  const getActiveCount = (category: FeatureCategory): number => {
    return features.filter((f) => f.category === category).length;
  };

  // Render feature row
  const renderFeatureRow = (
    category: FeatureCategory,
    featureDef: {
      key: string;
      label: string;
      type: "boolean" | "string" | "number";
    }
  ) => {
    const isEnabled = isFeatureEnabled(featureDef.key);
    const feature = getFeatureValue(featureDef.key);

    return (
      <div
        key={featureDef.key}
        className={cn(
          "flex items-center justify-between rounded-lg border p-3 transition-colors",
          isEnabled ? "border-primary/20 bg-primary/5" : "border-transparent"
        )}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            id={featureDef.key}
            checked={isEnabled}
            onCheckedChange={(checked) =>
              toggleFeature(category, featureDef.key, checked === true)
            }
          />
          <label
            htmlFor={featureDef.key}
            className={cn(
              "cursor-pointer text-sm font-medium",
              isEnabled && "text-foreground",
              !isEnabled && "text-muted-foreground"
            )}
          >
            {featureDef.label}
          </label>

          {feature?.verified && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </TooltipTrigger>
                <TooltipContent>Geverifieerd</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {feature?.highlighted && (
            <Badge variant="secondary" className="text-xs">
              <Star className="mr-1 h-3 w-3" />
              Uitgelicht
            </Badge>
          )}
        </div>

        {isEnabled && (
          <div className="flex items-center gap-2">
            {/* Additional value input for string/number types */}
            {featureDef.type === "string" && (
              <Input
                className="h-8 w-32"
                placeholder="Waarde"
                value={getFeatureStringValue(featureDef.key)}
                onChange={(e) =>
                  updateFeatureValue(
                    category,
                    featureDef.key,
                    e.target.value,
                    "string"
                  )
                }
              />
            )}

            {featureDef.type === "number" && (
              <Input
                type="number"
                className="h-8 w-24"
                placeholder="0"
                value={getFeatureNumericValue(featureDef.key) || ""}
                onChange={(e) =>
                  updateFeatureValue(
                    category,
                    featureDef.key,
                    parseFloat(e.target.value) || 0,
                    "number"
                  )
                }
              />
            )}

            {/* Highlight toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      feature?.highlighted && "text-amber-500"
                    )}
                    onClick={() => toggleHighlighted(featureDef.key)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {feature?.highlighted ? "Niet meer uitlichten" : "Uitlichten op listing"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Remove button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFeature(featureDef.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Verwijderen</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Kenmerken overzicht</CardTitle>
          <CardDescription>
            Selecteer de kenmerken die van toepassing zijn op dit pand. Uitgelichte
            kenmerken worden prominent getoond op de listing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(Object.keys(availableFeatures) as FeatureCategory[]).map(
              (category) => {
                const Icon = categoryIcons[category];
                const count = getActiveCount(category);
                const total = availableFeatures[category].length;

                return (
                  <div
                    key={category}
                    className={cn(
                      "flex items-center gap-3 rounded-lg p-3",
                      categoryColors[category]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-medium">
                        {featureCategoryLabels[category]}
                      </p>
                      <p className="text-xs opacity-80">
                        {count} van {total}
                      </p>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feature Categories */}
      <Accordion
        type="multiple"
        value={expandedCategories}
        onValueChange={setExpandedCategories}
        className="flex flex-col gap-4"
      >
        {(Object.keys(availableFeatures) as FeatureCategory[]).map((category) => {
          const Icon = categoryIcons[category];
          const activeCount = getActiveCount(category);

          return (
            <AccordionItem key={category} value={category} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={cn("rounded-lg p-2", categoryColors[category])}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold">
                      {featureCategoryLabels[category]}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {activeCount} kenmerken geselecteerd
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex flex-col gap-2">
                  {availableFeatures[category].map((featureDef) =>
                    renderFeatureRow(category, featureDef)
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button onClick={saveFeatures} disabled={isPending} size="lg">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Kenmerken opslaan
          </Button>
        </div>
      )}
    </div>
  );
}

// @ts-nocheck
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type PropertyWizardData } from "../types";
import {
  Maximize2,
  UtensilsCrossed,
  Package,
  TreePalm,
  ArrowDownFromLine,
  Layers,
  RulerIcon,
} from "lucide-react";

interface StepDimensionsProps {
  data: PropertyWizardData;
  onUpdate: (updates: Partial<PropertyWizardData>) => void;
  errors?: Record<string, string>;
}

// Surface input component
function SurfaceInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  icon: Icon,
  error,
  required,
  description,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  error?: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value ? parseInt(e.target.value) : null)
          }
          placeholder={placeholder}
          className={cn("pr-10", error && "border-destructive")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          m²
        </span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function StepDimensions({ data, onUpdate, errors }: StepDimensionsProps) {
  return (
    <div className="space-y-8">
      {/* Total Surface - Required & Prominent */}
      <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-6">
        <SurfaceInput
          id="surfaceTotal"
          value={data.surfaceTotal}
          onChange={(value) => onUpdate({ surfaceTotal: value })}
          placeholder="150"
          label="Totale oppervlakte"
          icon={Maximize2}
          error={errors?.surfaceTotal}
          required
          description="De totale verhuurbare/verkoopbare oppervlakte in vierkante meters"
        />
      </div>

      {/* Optional Surface Areas */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          Oppervlakteverdeling{" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Een gedetailleerde verdeling helpt geïnteresseerden de ruimte beter te
          begrijpen.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <SurfaceInput
            id="surfaceCommercial"
            value={data.surfaceCommercial}
            onChange={(value) => onUpdate({ surfaceCommercial: value })}
            placeholder="100"
            label="Commerciële ruimte"
            icon={Maximize2}
          />
          <SurfaceInput
            id="surfaceKitchen"
            value={data.surfaceKitchen}
            onChange={(value) => onUpdate({ surfaceKitchen: value })}
            placeholder="30"
            label="Keuken"
            icon={UtensilsCrossed}
          />
          <SurfaceInput
            id="surfaceStorage"
            value={data.surfaceStorage}
            onChange={(value) => onUpdate({ surfaceStorage: value })}
            placeholder="15"
            label="Opslag"
            icon={Package}
          />
          <SurfaceInput
            id="surfaceTerrace"
            value={data.surfaceTerrace}
            onChange={(value) => onUpdate({ surfaceTerrace: value })}
            placeholder="40"
            label="Terras"
            icon={TreePalm}
          />
          <SurfaceInput
            id="surfaceBasement"
            value={data.surfaceBasement}
            onChange={(value) => onUpdate({ surfaceBasement: value })}
            placeholder="25"
            label="Kelder"
            icon={ArrowDownFromLine}
          />
        </div>
      </div>

      {/* Building Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Gebouwdetails</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Floors */}
          <div className="space-y-2">
            <Label htmlFor="floors" className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Aantal verdiepingen
            </Label>
            <Input
              id="floors"
              type="number"
              min={1}
              max={20}
              value={data.floors}
              onChange={(e) =>
                onUpdate({ floors: Math.max(1, parseInt(e.target.value) || 1) })
              }
              placeholder="1"
            />
          </div>

          {/* Ceiling Height */}
          <div className="space-y-2">
            <Label htmlFor="ceilingHeight" className="text-sm font-medium flex items-center gap-2">
              <RulerIcon className="h-4 w-4 text-muted-foreground" />
              Plafondhoogte
            </Label>
            <div className="relative">
              <Input
                id="ceilingHeight"
                type="number"
                step="0.1"
                min={0}
                value={data.ceilingHeight ?? ""}
                onChange={(e) =>
                  onUpdate({
                    ceilingHeight: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="3.2"
                className="pr-10"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                m
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Surface Calculation Helper */}
      {data.surfaceTotal && (
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="text-sm font-medium">Oppervlaktesamenvatting</h4>
          <div className="mt-3 flex flex-wrap gap-3">
            <SurfaceBadge label="Totaal" value={data.surfaceTotal} highlight />
            {data.surfaceCommercial && (
              <SurfaceBadge label="Commercieel" value={data.surfaceCommercial} />
            )}
            {data.surfaceKitchen && (
              <SurfaceBadge label="Keuken" value={data.surfaceKitchen} />
            )}
            {data.surfaceStorage && (
              <SurfaceBadge label="Opslag" value={data.surfaceStorage} />
            )}
            {data.surfaceTerrace && (
              <SurfaceBadge label="Terras" value={data.surfaceTerrace} />
            )}
            {data.surfaceBasement && (
              <SurfaceBadge label="Kelder" value={data.surfaceBasement} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Surface badge component
function SurfaceBadge({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
        highlight
          ? "bg-primary/10 text-primary font-medium"
          : "bg-background text-foreground border"
      )}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value} m²</span>
    </span>
  );
}

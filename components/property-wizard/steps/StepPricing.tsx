// @ts-nocheck
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { PriceTypes, type PropertyWizardData, type PriceType } from "../types";
import { Euro, Home, Key, ArrowLeftRight } from "lucide-react";

const priceTypeIcons: Record<PriceType, React.ComponentType<{ className?: string }>> = {
  RENT: Key,
  SALE: Home,
  RENT_OR_SALE: ArrowLeftRight,
};

interface StepPricingProps {
  data: PropertyWizardData;
  onUpdate: (updates: Partial<PropertyWizardData>) => void;
  errors?: Record<string, string>;
}

// Helper to format currency input
function formatCurrency(value: number | null): string {
  if (value === null) return "";
  return value.toString();
}

// Helper to parse currency input (converts to cents)
function parseCurrency(value: string): number | null {
  const parsed = parseInt(value.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? null : parsed;
}

// Currency input component
function CurrencyInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  error,
  required,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  label: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <Euro className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={formatCurrency(value)}
          onChange={(e) => onChange(parseCurrency(e.target.value))}
          placeholder={placeholder}
          className={cn("pl-10", error && "border-destructive")}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function StepPricing({ data, onUpdate, errors }: StepPricingProps) {
  const showRentFields = data.priceType === "RENT" || data.priceType === "RENT_OR_SALE";
  const showSaleFields = data.priceType === "SALE" || data.priceType === "RENT_OR_SALE";

  return (
    <div className="space-y-8">
      {/* Price Type Selection */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">
          Type aanbieding <span className="text-destructive">*</span>
        </Label>
        <RadioGroup
          value={data.priceType}
          onValueChange={(value) => onUpdate({ priceType: value as PriceType })}
          className="grid gap-3 sm:grid-cols-3"
        >
          {PriceTypes.map((type) => {
            const Icon = priceTypeIcons[type.value];
            const isSelected = data.priceType === type.value;

            return (
              <Label
                key={type.value}
                htmlFor={`priceType-${type.value}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <RadioGroupItem
                  value={type.value}
                  id={`priceType-${type.value}`}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-medium">{type.label}</span>
              </Label>
            );
          })}
        </RadioGroup>
        {errors?.priceType && (
          <p className="text-sm text-destructive">{errors.priceType}</p>
        )}
      </div>

      {/* Rent Price Fields */}
      {showRentFields && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            Huurprijs
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              id="rentPrice"
              value={data.rentPrice}
              onChange={(value) => onUpdate({ rentPrice: value })}
              placeholder="2500"
              label="Huurprijs per maand"
              error={errors?.rentPrice}
              required={data.priceType === "RENT"}
            />
            <CurrencyInput
              id="rentPriceMin"
              value={data.rentPriceMin}
              onChange={(value) => onUpdate({ rentPriceMin: value })}
              placeholder="2000"
              label="Minimale huurprijs (optioneel)"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Vul een minimale prijs in als u open staat voor onderhandeling.
          </p>
        </div>
      )}

      {/* Sale Price Fields */}
      {showSaleFields && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Verkoopprijs
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              id="salePrice"
              value={data.salePrice}
              onChange={(value) => onUpdate({ salePrice: value })}
              placeholder="350000"
              label="Vraagprijs"
              error={errors?.salePrice}
              required={data.priceType === "SALE"}
            />
            <CurrencyInput
              id="salePriceMin"
              value={data.salePriceMin}
              onChange={(value) => onUpdate({ salePriceMin: value })}
              placeholder="320000"
              label="Minimale prijs (optioneel)"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Vul een minimale prijs in als u open staat voor onderhandeling.
          </p>
        </div>
      )}

      {/* Additional Costs */}
      {data.priceType && (
        <div className="space-y-4">
          <h3 className="font-medium text-foreground">Bijkomende kosten</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              id="servicesCosts"
              value={data.servicesCosts}
              onChange={(value) => onUpdate({ servicesCosts: value })}
              placeholder="250"
              label="Servicekosten per maand"
            />
            {showRentFields && (
              <div className="space-y-2">
                <Label htmlFor="depositMonths" className="text-sm font-medium">
                  Borg (aantal maanden)
                </Label>
                <Input
                  id="depositMonths"
                  type="number"
                  min={0}
                  max={12}
                  value={data.depositMonths ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      depositMonths: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="3"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price Negotiable Toggle */}
      {data.priceType && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="priceNegotiable" className="text-sm font-medium">
              Prijs onderhandelbaar
            </Label>
            <p className="text-xs text-muted-foreground">
              Geïnteresseerden weten dat ze een bod kunnen doen
            </p>
          </div>
          <Switch
            id="priceNegotiable"
            checked={data.priceNegotiable}
            onCheckedChange={(checked) => onUpdate({ priceNegotiable: checked })}
          />
        </div>
      )}

      {/* Pricing Tips */}
      <div className="rounded-lg bg-primary/5 p-4">
        <h4 className="text-sm font-medium text-primary">Prijstip</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Een realistische vraagprijs trekt meer serieuze geïnteresseerden aan.
          Vergelijk uw prijs met vergelijkbaar aanbod in de regio voor de beste
          resultaten.
        </p>
      </div>
    </div>
  );
}

// @ts-nocheck
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type PropertyWizardData } from "../types";
import {
  UtensilsCrossed,
  Coffee,
  Wine,
  Building2,
  ChefHat,
  PartyPopper,
  Store,
  Truck,
  Croissant,
  HelpCircle,
} from "lucide-react";

const propertyTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  RESTAURANT: UtensilsCrossed,
  CAFE: Coffee,
  BAR: Wine,
  HOTEL: Building2,
  DARK_KITCHEN: ChefHat,
  NIGHTCLUB: PartyPopper,
  FOOD_COURT: Store,
  CATERING: Truck,
  BAKERY: Croissant,
  OTHER: HelpCircle,
};

interface StepBasicInfoProps {
  data: PropertyWizardData;
  onUpdate: (updates: Partial<PropertyWizardData>) => void;
  errors?: Record<string, string>;
}

export function StepBasicInfo({ data, onUpdate, errors }: StepBasicInfoProps) {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">
          Titel van het pand <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={data.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Bijv. Karakteristiek Restaurant in Centrum Amsterdam"
          className={cn(errors?.title && "border-destructive")}
        />
        {errors?.title && (
          <p className="text-sm text-destructive">{errors.title}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Een pakkende titel trekt meer aandacht. Minimaal 5 karakters.
        </p>
      </div>

      {/* Property Type */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          Type horecagelegenheid <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PROPERTY_TYPES.map((type) => {
            const Icon = propertyTypeIcons[type];
            const isSelected = data.propertyType === type;

            return (
              <button
                key={type}
                type="button"
                onClick={() => onUpdate({ propertyType: type })}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  )}
                >
                  {Icon ? <Icon className="h-5 w-5" /> : <span className="h-5 w-5" />}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium text-center leading-tight",
                    isSelected ? "text-primary" : "text-foreground"
                  )}
                >
                  {PROPERTY_TYPE_LABELS[type] || type}
                </span>
              </button>
            );
          })}
        </div>
        {errors?.propertyType && (
          <p className="text-sm text-destructive">{errors.propertyType}</p>
        )}
      </div>

      {/* Short Description */}
      <div className="space-y-2">
        <Label htmlFor="shortDescription" className="text-sm font-medium">
          Korte omschrijving
        </Label>
        <Input
          id="shortDescription"
          value={data.description}
          onChange={(e) => onUpdate({ description: e.target.value.slice(0, 200) })}
          placeholder="Een beknopte samenvatting voor zoekresultaten..."
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          {data.description.length}/200 karakters
        </p>
      </div>

      {/* Full Description */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium">
          Volledige omschrijving
        </Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Beschrijf het pand in detail. Vertel over de sfeer, de mogelijkheden, de buurt en wat dit pand uniek maakt..."
          className="min-h-[160px] resize-y"
        />
        <p className="text-xs text-muted-foreground">
          Een goede beschrijving verhoogt de kans op aanvragen. Vertel wat dit
          pand speciaal maakt.
        </p>
      </div>
    </div>
  );
}

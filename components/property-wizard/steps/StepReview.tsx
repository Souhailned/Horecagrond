// @ts-nocheck
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PropertyTypes,
  PriceTypes,
  FeatureCategories,
  type PropertyWizardData,
  type WizardStep,
} from "../types";
import {
  FileText,
  MapPin,
  Euro,
  Ruler,
  ListChecks,
  Image,
  Pencil,
  Check,
  AlertCircle,
  Sparkles,
} from "lucide-react";

interface StepReviewProps {
  data: PropertyWizardData;
  onGoToStep: (step: number | WizardStep) => void;
  isSubmitting: boolean;
  onPublish: () => void;
  onSaveDraft: () => void;
}

// Format price to euros
function formatPrice(cents: number | null): string {
  if (cents === null) return "-";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents);
}

// Review section component
function ReviewSection({
  title,
  icon: Icon,
  step,
  onEdit,
  children,
  isComplete,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  step: WizardStep;
  onEdit: (step: WizardStep) => void;
  children: React.ReactNode;
  isComplete: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              isComplete ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
            )}
          >
            {isComplete ? <Icon className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </span>
          <span className="font-medium">{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(step)}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Bewerk
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// Data row component
function DataRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          "text-sm text-right",
          highlight ? "font-medium text-primary" : "text-foreground"
        )}
      >
        {value || <span className="text-muted-foreground/50">-</span>}
      </span>
    </div>
  );
}

export function StepReview({
  data,
  onGoToStep,
  isSubmitting,
  onPublish,
  onSaveDraft,
}: StepReviewProps) {
  // Check completeness of each section
  const isBasicInfoComplete = Boolean(data.title && data.propertyType);
  const isLocationComplete = Boolean(data.address && data.city && data.postalCode);
  const isPricingComplete = Boolean(
    data.priceType &&
      ((data.priceType === "RENT" && data.rentPrice) ||
        (data.priceType === "SALE" && data.salePrice) ||
        (data.priceType === "RENT_OR_SALE" && (data.rentPrice || data.salePrice)))
  );
  const isDimensionsComplete = Boolean(data.surfaceTotal);
  const isFeaturesComplete = true; // Features are optional
  const isPhotosComplete = data.photos.length > 0;

  const isAllComplete =
    isBasicInfoComplete &&
    isLocationComplete &&
    isPricingComplete &&
    isDimensionsComplete &&
    isPhotosComplete;

  // Get property type label
  const propertyTypeLabel =
    PropertyTypes.find((t) => t.value === data.propertyType)?.label || "-";

  // Get price type label
  const priceTypeLabel =
    PriceTypes.find((t) => t.value === data.priceType)?.label || "-";

  // Get selected features
  const selectedFeatures = Object.entries(data.features)
    .filter(([, selected]) => selected)
    .map(([key]) => {
      for (const category of Object.values(FeatureCategories)) {
        const feature = category.features.find((f) => f.key === key);
        if (feature) return feature.label;
      }
      return key;
    });

  // Count photos with AI enhancement
  const aiEnhanceCount = data.photos.filter((p) => p.aiEnhance).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-xl font-semibold">Controleer uw pand</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Controleer alle gegevens voordat u publiceert
        </p>
      </div>

      {/* Completeness indicator */}
      {!isAllComplete && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Niet alle vereiste velden zijn ingevuld
            </p>
            <p className="text-xs text-muted-foreground">
              Vul alle verplichte velden in om te kunnen publiceren
            </p>
          </div>
        </div>
      )}

      {/* Review Sections */}
      <div className="space-y-4">
        {/* Basic Info */}
        <ReviewSection
          title="Basis Info"
          icon={FileText}
          step={1}
          onEdit={onGoToStep}
          isComplete={isBasicInfoComplete}
        >
          <div className="space-y-1">
            <DataRow label="Titel" value={data.title} highlight />
            <DataRow label="Type" value={propertyTypeLabel} />
            <DataRow
              label="Korte omschrijving"
              value={
                data.shortDescription
                  ? `${data.shortDescription.substring(0, 50)}${data.shortDescription.length > 50 ? "..." : ""}`
                  : null
              }
            />
            <DataRow
              label="Beschrijving"
              value={
                data.description ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3 text-primary" />
                    Ingevuld ({data.description.length} tekens)
                  </span>
                ) : null
              }
            />
          </div>
        </ReviewSection>

        {/* Location */}
        <ReviewSection
          title="Locatie"
          icon={MapPin}
          step={2}
          onEdit={onGoToStep}
          isComplete={isLocationComplete}
        >
          <div className="space-y-1">
            <DataRow label="Adres" value={data.address} />
            {data.addressLine2 && <DataRow label="Adresregel 2" value={data.addressLine2} />}
            <DataRow label="Stad" value={data.city} highlight />
            <DataRow label="Postcode" value={data.postalCode} />
            <DataRow label="Provincie" value={data.province} />
            {(data.latitude || data.longitude) && (
              <DataRow
                label="Coördinaten"
                value={`${data.latitude?.toFixed(4)}, ${data.longitude?.toFixed(4)}`}
              />
            )}
          </div>
        </ReviewSection>

        {/* Pricing */}
        <ReviewSection
          title="Prijzen"
          icon={Euro}
          step={3}
          onEdit={onGoToStep}
          isComplete={isPricingComplete}
        >
          <div className="space-y-1">
            <DataRow label="Type" value={priceTypeLabel} />
            {(data.priceType === "RENT" || data.priceType === "RENT_OR_SALE") && (
              <>
                <DataRow label="Huurprijs" value={formatPrice(data.rentPrice)} highlight />
                {data.rentPriceMin && (
                  <DataRow label="Min. huurprijs" value={formatPrice(data.rentPriceMin)} />
                )}
              </>
            )}
            {(data.priceType === "SALE" || data.priceType === "RENT_OR_SALE") && (
              <>
                <DataRow label="Verkoopprijs" value={formatPrice(data.salePrice)} highlight />
                {data.salePriceMin && (
                  <DataRow label="Min. verkoopprijs" value={formatPrice(data.salePriceMin)} />
                )}
              </>
            )}
            {data.servicesCosts && (
              <DataRow label="Servicekosten" value={`${formatPrice(data.servicesCosts)}/mnd`} />
            )}
            {data.depositMonths && (
              <DataRow label="Borg" value={`${data.depositMonths} maand(en)`} />
            )}
            <DataRow
              label="Onderhandelbaar"
              value={data.priceNegotiable ? "Ja" : "Nee"}
            />
          </div>
        </ReviewSection>

        {/* Dimensions */}
        <ReviewSection
          title="Afmetingen"
          icon={Ruler}
          step={4}
          onEdit={onGoToStep}
          isComplete={isDimensionsComplete}
        >
          <div className="space-y-1">
            <DataRow
              label="Totale oppervlakte"
              value={data.surfaceTotal ? `${data.surfaceTotal} m²` : null}
              highlight
            />
            {data.surfaceCommercial && (
              <DataRow label="Commercieel" value={`${data.surfaceCommercial} m²`} />
            )}
            {data.surfaceKitchen && (
              <DataRow label="Keuken" value={`${data.surfaceKitchen} m²`} />
            )}
            {data.surfaceStorage && (
              <DataRow label="Opslag" value={`${data.surfaceStorage} m²`} />
            )}
            {data.surfaceTerrace && (
              <DataRow label="Terras" value={`${data.surfaceTerrace} m²`} />
            )}
            {data.surfaceBasement && (
              <DataRow label="Kelder" value={`${data.surfaceBasement} m²`} />
            )}
            <DataRow label="Verdiepingen" value={data.floors} />
            {data.ceilingHeight && (
              <DataRow label="Plafondhoogte" value={`${data.ceilingHeight} m`} />
            )}
          </div>
        </ReviewSection>

        {/* Features */}
        <ReviewSection
          title="Kenmerken"
          icon={ListChecks}
          step={5}
          onEdit={onGoToStep}
          isComplete={isFeaturesComplete}
        >
          {selectedFeatures.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedFeatures.map((feature) => (
                <Badge key={feature} variant="secondary" className="text-xs">
                  <Check className="mr-1 h-3 w-3" />
                  {feature}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Geen kenmerken geselecteerd
            </p>
          )}
        </ReviewSection>

        {/* Photos */}
        <ReviewSection
          title="Foto's"
          icon={Image}
          step={6}
          onEdit={onGoToStep}
          isComplete={isPhotosComplete}
        >
          {data.photos.length > 0 ? (
            <div className="space-y-3">
              <DataRow
                label="Aantal foto's"
                value={`${data.photos.length} foto${data.photos.length !== 1 ? "'s" : ""}`}
                highlight
              />
              {aiEnhanceCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-muted-foreground">
                    {aiEnhanceCount} foto{aiEnhanceCount !== 1 ? "'s" : ""} met AI verbetering
                  </span>
                </div>
              )}
              {/* Photo thumbnails */}
              <div className="grid grid-cols-6 gap-2">
                {data.photos.slice(0, 6).map((photo, index) => (
                  <div
                    key={photo.id}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-md",
                      photo.isPrimary && "ring-2 ring-primary"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt={`Foto ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {index === 5 && data.photos.length > 6 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm font-medium">
                        +{data.photos.length - 6}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Geen foto&apos;s toegevoegd (verplicht)
            </div>
          )}
        </ReviewSection>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-4 border-t">
        <Button
          onClick={onPublish}
          disabled={!isAllComplete || isSubmitting}
          size="lg"
          className="w-full"
        >
          {isSubmitting ? (
            "Bezig met publiceren..."
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Publiceer Pand
            </>
          )}
        </Button>
        <Button
          onClick={onSaveDraft}
          disabled={isSubmitting}
          variant="outline"
          size="lg"
          className="w-full"
        >
          Bewaar als Concept
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          U kunt het pand later altijd nog bewerken
        </p>
      </div>
    </div>
  );
}

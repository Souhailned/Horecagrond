"use client";

import { useRouter } from "next/navigation";
import {
  Buildings,
  Eye,
  ChatCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  PropertyStatusLabels,
  PropertyTypeLabels,
  formatPrice,
} from "@/types/property";
import type { DashboardProperty } from "@/app/actions/get-property";
import { PropertyQuickActions } from "./property-quick-actions";
import type { AiActionType } from "./property-quick-actions";
import { HealthScoreBadge } from "./health-score-badge";
import { StaleListingIndicator } from "./stale-listing-indicator";
import { getStatusStyles } from "./status-styles";

interface PandenGridViewProps {
  properties: DashboardProperty[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  canBulkSelect: boolean;
  onStatusChange?: (propertyId: string, status: string) => void;
  onDuplicate?: (propertyId: string) => void;
  onArchive?: (propertyId: string) => void;
  onAiAction?: (propertyId: string, action: AiActionType) => void;
  stalePropertyIds?: Set<string>;
}

export function PandenGridView({
  properties,
  selectedIds,
  onToggleSelect,
  canBulkSelect,
  onStatusChange,
  onDuplicate,
  onArchive,
  onAiAction,
  stalePropertyIds,
}: PandenGridViewProps) {
  const router = useRouter();

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Buildings className="size-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Geen resultaten
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Er zijn geen panden gevonden met deze filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <GridCard
          key={property.id}
          property={property}
          isSelected={selectedIds.has(property.id)}
          canBulkSelect={canBulkSelect}
          onToggleSelect={onToggleSelect}
          onStatusChange={onStatusChange}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onAiAction={onAiAction}
          isStale={stalePropertyIds?.has(property.id) ?? false}
          onClick={() => router.push(`/dashboard/panden/${property.id}`)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Single grid card
// ---------------------------------------------------------------------------

function GridCard({
  property,
  isSelected,
  canBulkSelect,
  onToggleSelect,
  onStatusChange,
  onDuplicate,
  onArchive,
  onAiAction,
  isStale,
  onClick,
}: {
  property: DashboardProperty;
  isSelected: boolean;
  canBulkSelect: boolean;
  onToggleSelect: (id: string) => void;
  onStatusChange?: (propertyId: string, status: string) => void;
  onDuplicate?: (propertyId: string) => void;
  onArchive?: (propertyId: string) => void;
  onAiAction?: (propertyId: string, action: AiActionType) => void;
  isStale: boolean;
  onClick: () => void;
}) {
  const { rentPrice, salePrice, priceType } = property;
  const price = rentPrice ?? salePrice;
  const suffix = priceType === "RENT" ? " /mnd" : "";

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-2xl border border-border bg-background transition-shadow hover:shadow-lg/5",
        isSelected && "ring-2 ring-primary/30"
      )}
      onClick={onClick}
    >
      {/* Checkbox overlay */}
      {canBulkSelect && (
        <div
          className="absolute left-3 top-3 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            aria-label={`Selecteer ${property.title}`}
            className="rounded-full border-background/80 bg-background/80 backdrop-blur-sm"
          />
        </div>
      )}

      {/* Image */}
      <div className="aspect-[4/3] overflow-hidden rounded-t-2xl bg-muted">
        {property.thumbnailUrl ? (
          <img
            src={property.thumbnailUrl}
            alt={property.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Buildings className="size-8 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* Status + Actions row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                getStatusStyles(property.status)
              )}
            >
              {PropertyStatusLabels[property.status]}
            </span>
            {isStale && (
              <StaleListingIndicator
                propertyId={property.id}
                daysOnline={property.daysOnline ?? 0}
                inquiryCount={property.inquiryCount}
              />
            )}
          </div>
          <div
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <PropertyQuickActions
              property={property}
              onStatusChange={onStatusChange}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onAiAction={onAiAction}
            />
          </div>
        </div>

        {/* Title + Location */}
        <div>
          <p className="truncate text-[15px] font-semibold leading-6 text-foreground">
            {property.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {property.city}
            {property.province && `, ${property.province}`}
          </p>
        </div>

        {/* Price + Area */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">
            {formatPrice(price)}
            {price != null && (
              <span className="font-normal text-muted-foreground">
                {suffix}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {property.surfaceTotal} m²
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" />
            {property.viewCount}
          </span>
          <span className="flex items-center gap-1">
            <ChatCircle className="size-3.5" />
            {property.inquiryCount}
          </span>
          <HealthScoreBadge score={property.healthScore ?? null} size="sm" />
          <span className="ml-auto text-xs text-muted-foreground">
            {PropertyTypeLabels[property.propertyType]}
          </span>
        </div>
      </div>
    </div>
  );
}

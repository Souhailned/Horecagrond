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

interface PandenListViewProps {
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

export function PandenListView({
  properties,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  canBulkSelect,
  onStatusChange,
  onDuplicate,
  onArchive,
  onAiAction,
  stalePropertyIds,
}: PandenListViewProps) {
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
    <div>
      {/* Column header row */}
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        {canBulkSelect && (
          <div className="shrink-0" style={{ width: 20 }}>
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => onSelectAll()}
              aria-label="Alles selecteren"
              className="rounded-full"
            />
          </div>
        )}
        <div className="w-12 shrink-0" />
        <div className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pand
        </div>
        <div className="hidden w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:block">
          Status
        </div>
        <div className="hidden w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground md:block">
          Type
        </div>
        <div className="hidden w-24 shrink-0 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground sm:block">
          Prijs
        </div>
        <div className="hidden w-16 shrink-0 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
          Views
        </div>
        <div className="hidden w-20 shrink-0 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
          Aanvragen
        </div>
        {/* Spacer for actions column */}
        <div className="w-8 shrink-0" />
      </div>

      {/* Property rows */}
      {properties.map((property) => (
        <ListRow
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
// Internal: Single list row
// ---------------------------------------------------------------------------

function ListRow({
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
        "group flex cursor-pointer items-center gap-4 border-b border-border/40 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50",
        isSelected && "bg-muted/30"
      )}
      onClick={onClick}
    >
      {/* Checkbox */}
      {canBulkSelect && (
        <div className="shrink-0" style={{ width: 20 }}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecteer ${property.title}`}
            className="rounded-full"
          />
        </div>
      )}

      {/* Thumbnail */}
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
        {property.thumbnailUrl ? (
          <img
            src={property.thumbnailUrl}
            alt={property.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Buildings className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Title + City + Health Score */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {property.title}
          </p>
          <HealthScoreBadge score={property.healthScore ?? null} />
        </div>
        <p className="text-xs text-muted-foreground">{property.city}</p>
      </div>

      {/* Status badge + stale indicator */}
      <div className="hidden w-28 shrink-0 sm:flex items-center gap-1.5">
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

      {/* Type */}
      <div className="hidden w-24 shrink-0 md:block">
        <span className="text-sm text-muted-foreground">
          {PropertyTypeLabels[property.propertyType]}
        </span>
      </div>

      {/* Price */}
      <div className="hidden w-24 shrink-0 text-right sm:block">
        <span className="text-sm font-medium text-foreground">
          {formatPrice(price)}
          {price != null && (
            <span className="text-muted-foreground">{suffix}</span>
          )}
        </span>
      </div>

      {/* Views */}
      <div className="hidden w-16 shrink-0 lg:flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <Eye className="size-3.5" />
        {property.viewCount}
      </div>

      {/* Inquiries */}
      <div className="hidden w-20 shrink-0 lg:flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <ChatCircle className="size-3.5" />
        {property.inquiryCount}
      </div>

      {/* Actions (hover reveal) */}
      <div
        className="w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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
  );
}

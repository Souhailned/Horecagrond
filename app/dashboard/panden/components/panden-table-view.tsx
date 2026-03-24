"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Buildings,
  Eye,
  ChatCircle,
  CaretUp,
  CaretDown,
  CaretUpDown,
} from "@phosphor-icons/react/dist/ssr";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface PandenTableViewProps {
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

export function PandenTableView({
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
}: PandenTableViewProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<DashboardProperty>[]>(() => {
    const cols: ColumnDef<DashboardProperty>[] = [];

    // Select column
    if (canBulkSelect) {
      cols.push({
        id: "select",
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onSelectAll()}
            aria-label="Alles selecteren"
            className="rounded-full"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => onToggleSelect(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecteer ${row.original.title}`}
            className="rounded-full"
          />
        ),
        enableSorting: false,
        size: 40,
      });
    }

    // Property column (thumbnail + title + city)
    cols.push({
      accessorKey: "title",
      header: "Pand",
      cell: ({ row }) => {
        const { title, city, thumbnailUrl } = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Buildings className="size-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {title}
              </p>
              <p className="text-xs text-muted-foreground">{city}</p>
            </div>
          </div>
        );
      },
      enableSorting: true,
    });

    // Status column (with stale indicator)
    cols.push({
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const { status, id, daysOnline, inquiryCount } = row.original;
        const isStale = stalePropertyIds?.has(id) ?? false;
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                getStatusStyles(status)
              )}
            >
              {PropertyStatusLabels[status]}
            </span>
            {isStale && (
              <StaleListingIndicator
                propertyId={id}
                daysOnline={daysOnline ?? 0}
                inquiryCount={inquiryCount}
              />
            )}
          </div>
        );
      },
      enableSorting: true,
    });

    // Type column
    cols.push({
      accessorKey: "propertyType",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {PropertyTypeLabels[row.original.propertyType]}
        </span>
      ),
      enableSorting: true,
    });

    // Price column
    cols.push({
      id: "price",
      header: "Prijs",
      accessorFn: (row) => row.rentPrice ?? row.salePrice ?? 0,
      cell: ({ row }) => {
        const { rentPrice, salePrice, priceType } = row.original;
        const price = rentPrice ?? salePrice;
        const suffix = priceType === "RENT" ? " /mnd" : "";
        return (
          <span className="text-sm font-medium text-foreground">
            {formatPrice(price)}
            {price != null && (
              <span className="text-muted-foreground">{suffix}</span>
            )}
          </span>
        );
      },
      enableSorting: true,
    });

    // Area column
    cols.push({
      accessorKey: "surfaceTotal",
      header: "Opp.",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.surfaceTotal} m²
        </span>
      ),
      enableSorting: true,
    });

    // Health Score column
    cols.push({
      accessorKey: "healthScore",
      header: "Score",
      cell: ({ row }) => (
        <HealthScoreBadge score={row.original.healthScore ?? null} />
      ),
      enableSorting: true,
      size: 60,
    });

    // Views column
    cols.push({
      accessorKey: "viewCount",
      header: "Views",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Eye className="size-3.5" />
          {row.original.viewCount}
        </span>
      ),
      enableSorting: true,
    });

    // Inquiries column
    cols.push({
      accessorKey: "inquiryCount",
      header: "Aanvragen",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ChatCircle className="size-3.5" />
          {row.original.inquiryCount}
        </span>
      ),
      enableSorting: true,
    });

    // Actions column
    cols.push({
      id: "actions",
      header: "Acties",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <PropertyQuickActions
            property={row.original}
            onStatusChange={onStatusChange}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onAiAction={onAiAction}
          />
        </div>
      ),
      enableSorting: false,
      size: 48,
    });

    return cols;
  }, [canBulkSelect, allSelected, selectedIds, onSelectAll, onToggleSelect, onStatusChange, onDuplicate, onArchive, onAiAction, stalePropertyIds]);

  const table = useReactTable({
    data: properties,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={cn(
                  "text-xs font-medium uppercase tracking-wider text-muted-foreground",
                  header.column.getCanSort() && "cursor-pointer select-none"
                )}
                style={{
                  width: header.column.columnDef.size
                    ? `${header.column.columnDef.size}px`
                    : undefined,
                }}
                onClick={header.column.getToggleSortingHandler()}
              >
                {header.isPlaceholder ? null : (
                  <div className="flex items-center gap-1">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getCanSort() && (
                      <SortIndicator direction={header.column.getIsSorted()} />
                    )}
                  </div>
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            data-state={selectedIds.has(row.original.id) ? "selected" : undefined}
            onClick={() =>
              router.push(`/dashboard/panden/${row.original.id}`)
            }
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Internal helper: Sort direction indicator
// ---------------------------------------------------------------------------

function SortIndicator({
  direction,
}: {
  direction: false | "asc" | "desc";
}) {
  if (direction === "asc") {
    return <CaretUp className="size-3.5 text-foreground" />;
  }
  if (direction === "desc") {
    return <CaretDown className="size-3.5 text-foreground" />;
  }
  return <CaretUpDown className="size-3 text-muted-foreground/60" />;
}

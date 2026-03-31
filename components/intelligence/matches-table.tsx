"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Star,
  Phone,
  Globe,
  MapPin,
  NotePencil,
  Spinner,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { cn } from "@/lib/utils";
import type { MatchWithBusiness } from "@/app/actions/intelligence-matches";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  reviewed: "Bekeken",
  starred: "Interessant",
  contacted: "Gecontacteerd",
  dismissed: "Afgewezen",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS);

function getStatusColor(status: string): string {
  switch (status) {
    case "starred":
      return "text-amber-600";
    case "contacted":
      return "text-emerald-600";
    case "dismissed":
      return "text-muted-foreground line-through";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Score Badge
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { score: number }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-12 h-8 rounded-lg text-xs font-semibold",
        score >= 80
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          : score >= 50
            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {score}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating Stars
// ---------------------------------------------------------------------------

function RatingDisplay({
  rating,
  reviewCount,
}: {
  rating: number | null;
  reviewCount: number | null;
}) {
  if (rating == null) {
    return <span className="text-xs text-muted-foreground">&mdash;</span>;
  }

  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const totalRendered = hasHalf ? fullStars + 1 : fullStars;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-px">
        {Array.from({ length: Math.min(totalRendered, 5) }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-3 w-3",
              i < fullStars
                ? "text-amber-500"
                : "text-amber-500/50",
            )}
            weight="fill"
          />
        ))}
      </div>
      <span className="text-xs font-medium text-foreground">
        {rating.toFixed(1)}
      </span>
      {reviewCount != null && (
        <span className="text-xs text-muted-foreground">
          ({reviewCount})
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal Badge
// ---------------------------------------------------------------------------

function SignalBadge({ signalScore }: { signalScore: number }) {
  if (signalScore <= 0) {
    return <span className="text-xs text-muted-foreground">0</span>;
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] tabular-nums",
        signalScore > 50
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          : signalScore > 20
            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
            : "",
      )}
    >
      {signalScore}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sortable Header
// ---------------------------------------------------------------------------

function SortableHeader({
  column,
  children,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <CaretUp className="h-3 w-3" weight="bold" />
      ) : sorted === "desc" ? (
        <CaretDown className="h-3 w-3" weight="bold" />
      ) : (
        <CaretUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MatchesTableProps {
  matches: MatchWithBusiness[];
  onStatusChange: (matchId: string, status: string) => void;
  onSelectMatch: (match: MatchWithBusiness) => void;
  updatingId: string | null;
}

// ---------------------------------------------------------------------------
// Column Definitions
// ---------------------------------------------------------------------------

function buildColumns(
  onStatusChange: (matchId: string, status: string) => void,
  onSelectMatch: (match: MatchWithBusiness) => void,
  updatingId: string | null,
): ColumnDef<MatchWithBusiness>[] {
  return [
    // 1. Score
    {
      accessorKey: "matchScore",
      header: ({ column }) => (
        <SortableHeader column={column}>Score</SortableHeader>
      ),
      cell: ({ row }) => <ScoreBadge score={row.original.matchScore} />,
      size: 80,
    },

    // 2. Naam
    {
      accessorFn: (row) => row.business.name,
      id: "name",
      header: ({ column }) => (
        <SortableHeader column={column}>Naam</SortableHeader>
      ),
      cell: ({ row }) => {
        const business = row.original.business;
        return (
          <div className="max-w-[250px] min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {business.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {business.address}
            </p>
          </div>
        );
      },
      size: 250,
    },

    // 3. Rating
    {
      accessorFn: (row) => row.business.currentRating ?? -1,
      id: "rating",
      header: ({ column }) => (
        <SortableHeader column={column}>Rating</SortableHeader>
      ),
      cell: ({ row }) => (
        <RatingDisplay
          rating={row.original.business.currentRating}
          reviewCount={row.original.business.totalReviews}
        />
      ),
      size: 160,
    },

    // 4. Type
    {
      accessorFn: (row) => row.business.businessType ?? "",
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.business.businessType;
        if (!type) return null;
        return (
          <Badge variant="secondary" className="text-[10px] capitalize">
            {type.replace(/_/g, " ")}
          </Badge>
        );
      },
      size: 140,
    },

    // 5. Signalen
    {
      accessorFn: (row) => row.business.signalScore,
      id: "signals",
      header: ({ column }) => (
        <SortableHeader column={column}>Signalen</SortableHeader>
      ),
      cell: ({ row }) => (
        <SignalBadge signalScore={row.original.business.signalScore} />
      ),
      size: 100,
    },

    // 6. Status
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const match = row.original;
        const isUpdating = updatingId === match.id;

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Select
              value={match.status}
              onValueChange={(value) => onStatusChange(match.id, value)}
              disabled={isUpdating}
            >
              <SelectTrigger
                size="sm"
                className={cn(
                  "h-7 text-xs w-auto min-w-[120px]",
                  getStatusColor(match.status),
                )}
              >
                {isUpdating ? (
                  <Spinner className="h-3 w-3 animate-spin" weight="bold" />
                ) : (
                  <SelectValue />
                )}
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      },
      size: 140,
      enableSorting: false,
    },

    // 7. Acties
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const business = row.original.business;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${business.name} ${business.address}`,
        )}`;

        return (
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {business.phone && (
              <a href={`tel:${business.phone}`} title="Bellen">
                <Button variant="ghost" size="icon" className="size-7">
                  <Phone className="h-3.5 w-3.5" weight="regular" />
                </Button>
              </a>
            )}
            {business.website && (
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer"
                title="Website"
              >
                <Button variant="ghost" size="icon" className="size-7">
                  <Globe className="h-3.5 w-3.5" weight="regular" />
                </Button>
              </a>
            )}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Google Maps"
            >
              <Button variant="ghost" size="icon" className="size-7">
                <MapPin className="h-3.5 w-3.5" weight="regular" />
              </Button>
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onSelectMatch(row.original)}
              title="Details & notities"
            >
              <NotePencil className="h-3.5 w-3.5" weight="regular" />
            </Button>
          </div>
        );
      },
      size: 160,
      enableSorting: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MatchesTable({
  matches,
  onStatusChange,
  onSelectMatch,
  updatingId,
}: MatchesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "matchScore", desc: true },
  ]);

  const columns = useMemo(
    () => buildColumns(onStatusChange, onSelectMatch, updatingId),
    [onStatusChange, onSelectMatch, updatingId],
  );

  const table = useReactTable({
    data: matches,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageSize: 25 },
    },
  });

  return (
    <div className="flex w-full flex-col gap-2.5 overflow-auto">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectMatch(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Geen matches gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} pageSizeOptions={[25, 50, 100]} />
    </div>
  );
}

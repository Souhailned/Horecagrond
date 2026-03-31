"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { Plus, Buildings } from "@phosphor-icons/react/dist/ssr";
import type { DashboardProperty } from "@/app/actions/get-property";
import type { UserRole } from "@/lib/rbac";
import type { PropertyStatus } from "@/generated/prisma/client";
import { PropertyStatusLabels } from "@/types/property";
import { PandenToolbar } from "./components/panden-toolbar";
import { PandenTableView } from "./components/panden-table-view";
import { PandenListView } from "./components/panden-list-view";
import { PandenGridView } from "./components/panden-grid-view";
import { PandenBulkBar } from "./components/panden-bulk-bar";
import { AiActionDialog, type AiActionResultData } from "./components/ai-action-dialog";
import { PortfolioSummaryWidget } from "./components/portfolio-summary";
import { updatePropertyStatus } from "@/app/actions/update-property-status";
import { deleteProperty } from "@/app/actions/delete-property";
import { duplicateProperty } from "@/app/actions/duplicate-property";
import { getMyPropertiesForDashboard } from "@/app/actions/get-property";
import {
  generatePropertyDescription,
  generatePropertySocialPosts,
  getPropertyAiAdvice,
} from "@/app/actions/ai-quick-actions";
import { triggerBulkAiGenerate, getBulkAiProgress } from "@/app/actions/ai-bulk-generate";
import type { AiActionType } from "./components/property-quick-actions";
import type { PortfolioSummary } from "@/app/actions/portfolio-summary";
import { toast } from "sonner";

export type ViewMode = "table" | "list" | "grid";
type SortOption = "newest" | "oldest" | "price_high" | "price_low" | "views" | "inquiries" | "health";

interface PandenClientProps {
  initialProperties: DashboardProperty[];
  initialSummary?: PortfolioSummary | null;
  userId: string;
  userRole: UserRole;
}

export function PandenClient({
  initialProperties,
  initialSummary,
  userId,
  userRole,
}: PandenClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, isAdmin } = usePermissions();
  const [isPending, startTransition] = useTransition();

  // Properties state (for optimistic updates)
  const [properties, setProperties] = useState(initialProperties);

  // URL-synced state
  const viewMode = (searchParams.get("view") as ViewMode) || "table";
  const statusFilter = searchParams.get("status") || "ALL";
  const sortBy = (searchParams.get("sort") as SortOption) || "newest";
  const searchQuery = searchParams.get("q") || "";
  const scope = (searchParams.get("scope") as "all" | "mine") || (isAdmin ? "all" : "mine");

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // AI dialog state
  const [aiDialog, setAiDialog] = useState<{
    open: boolean;
    propertyId: string | null;
    propertyTitle: string;
    type: AiActionType | null;
    loading: boolean;
    error: string | null;
    result: AiActionResultData | null;
  }>({
    open: false,
    propertyId: null,
    propertyTitle: "",
    type: null,
    loading: false,
    error: null,
    result: null,
  });

  // Stale property detection
  const stalePropertyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of properties) {
      if (p.status === "ACTIVE" && p.daysOnline != null) {
        if (p.daysOnline > 30 && p.inquiryCount === 0) ids.add(p.id);
        else if (p.daysOnline > 60) ids.add(p.id);
      }
    }
    return ids;
  }, [properties]);

  const canAi = can("ai:description");

  // URL update helper
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // Search with debounce (ref-based cleanup to prevent timer leaks)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (value: string) => {
      setDebouncedSearch(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        updateParams({ q: value || null });
      }, 300);
    },
    [updateParams]
  );

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: properties.length };
    for (const p of properties) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [properties]);

  // Client-side filtering + sorting
  const filteredProperties = useMemo(() => {
    let result = [...properties];

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          (p.province?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "price_high": {
          const pa = a.rentPrice ?? a.salePrice ?? 0;
          const pb = b.rentPrice ?? b.salePrice ?? 0;
          return pb - pa;
        }
        case "price_low": {
          const pa = a.rentPrice ?? a.salePrice ?? 0;
          const pb = b.rentPrice ?? b.salePrice ?? 0;
          return pa - pb;
        }
        case "views":
          return b.viewCount - a.viewCount;
        case "inquiries":
          return b.inquiryCount - a.inquiryCount;
        case "health":
          return (b.healthScore ?? -1) - (a.healthScore ?? -1);
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [properties, statusFilter, debouncedSearch, sortBy]);

  // Bulk selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredProperties.length) return new Set();
      return new Set(filteredProperties.map((p) => p.id));
    });
  }, [filteredProperties]);

  const allSelected =
    filteredProperties.length > 0 &&
    selectedIds.size === filteredProperties.length;
  const canBulkSelect = can("properties:bulk-status");

  // Actions
  const handleStatusChange = useCallback(
    async (propertyId: string, status: string) => {
      // Capture snapshot for rollback
      let snapshot: DashboardProperty[] = [];
      setProperties((prev) => {
        snapshot = prev;
        return prev.map((p) =>
          p.id === propertyId ? { ...p, status: status as PropertyStatus } : p
        );
      });

      const result = await updatePropertyStatus(
        propertyId,
        status as "DRAFT" | "ACTIVE" | "UNDER_OFFER" | "RENTED" | "SOLD" | "ARCHIVED"
      );

      if ("error" in result && result.error) {
        toast.error(result.error);
        setProperties(snapshot);
      } else {
        toast.success(`Status gewijzigd naar ${PropertyStatusLabels[status as PropertyStatus] ?? status}`);
      }
    },
    []
  );

  const handleDuplicate = useCallback(
    async (propertyId: string) => {
      const result = await duplicateProperty(propertyId);
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else {
        toast.success("Pand gedupliceerd");
        // Refresh data
        startTransition(async () => {
          const fresh = await getMyPropertiesForDashboard(scope);
          if (fresh.success && fresh.data) setProperties(fresh.data);
        });
      }
    },
    [scope]
  );

  const handleArchive = useCallback(
    async (propertyId: string) => {
      let snapshot: DashboardProperty[] = [];
      setProperties((prev) => {
        snapshot = prev;
        return prev.map((p) =>
          p.id === propertyId
            ? { ...p, status: "ARCHIVED" as PropertyStatus }
            : p
        );
      });

      const result = await deleteProperty(propertyId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        setProperties(snapshot);
      } else {
        toast.success("Pand gearchiveerd");
      }
    },
    []
  );

  const handleBulkStatusChange = useCallback(
    async (status: string) => {
      const ids = Array.from(selectedIds);
      // Optimistic
      setProperties((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, status: status as PropertyStatus }
            : p
        )
      );
      setSelectedIds(new Set());

      // Execute in parallel
      const results = await Promise.allSettled(
        ids.map((id) =>
          updatePropertyStatus(
            id,
            status as "DRAFT" | "ACTIVE" | "UNDER_OFFER" | "RENTED" | "SOLD" | "ARCHIVED"
          )
        )
      );
      const errorCount = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && "error" in r.value && r.value.error)
      ).length;

      if (errorCount > 0) {
        toast.error(`${errorCount} van ${ids.length} panden konden niet worden bijgewerkt`);
        startTransition(async () => {
          const fresh = await getMyPropertiesForDashboard(scope);
          if (fresh.success && fresh.data) setProperties(fresh.data);
        });
      } else {
        toast.success(`${ids.length} panden bijgewerkt`);
      }
    },
    [selectedIds, scope]
  );

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setProperties((prev) =>
      prev.map((p) =>
        ids.includes(p.id)
          ? { ...p, status: "ARCHIVED" as PropertyStatus }
          : p
      )
    );
    setSelectedIds(new Set());

    const archiveResults = await Promise.allSettled(
      ids.map((id) => deleteProperty(id))
    );
    const errorCount = archiveResults.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && "error" in r.value && r.value.error)
    ).length;

    if (errorCount > 0) {
      toast.error(`${errorCount} panden konden niet worden gearchiveerd`);
      startTransition(async () => {
        const fresh = await getMyPropertiesForDashboard(scope);
        if (fresh.success && fresh.data) setProperties(fresh.data);
      });
    } else {
      toast.success(`${ids.length} panden gearchiveerd`);
    }
  }, [selectedIds, scope]);

  // AI Quick Actions
  const handleAiAction = useCallback(
    async (propertyId: string, action: AiActionType) => {
      const property = properties.find((p) => p.id === propertyId);
      setAiDialog({
        open: true,
        propertyId,
        propertyTitle: property?.title ?? "Pand",
        type: action,
        loading: true,
        error: null,
        result: null,
      });

      try {
        let result;
        switch (action) {
          case "description":
            result = await generatePropertyDescription(propertyId);
            break;
          case "social":
            result = await generatePropertySocialPosts(propertyId);
            break;
          case "advice":
            result = await getPropertyAiAdvice(propertyId);
            break;
        }

        if (result.success && result.data) {
          setAiDialog((prev) => ({
            ...prev,
            loading: false,
            result: result.data as AiActionResultData,
          }));
          if (action === "description") {
            toast.success("Beschrijving gegenereerd en opgeslagen");
            // Refresh properties to show updated description
            startTransition(async () => {
              const fresh = await getMyPropertiesForDashboard(scope);
              if (fresh.success && fresh.data) setProperties(fresh.data);
            });
          }
        } else {
          setAiDialog((prev) => ({
            ...prev,
            loading: false,
            error: result.success ? "Er ging iets mis" : result.error,
          }));
        }
      } catch {
        setAiDialog((prev) => ({
          ...prev,
          loading: false,
          error: "Er ging iets mis bij het genereren",
        }));
      }
    },
    [properties, scope]
  );

  // Bulk AI Generate
  const bulkPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleBulkAiGenerate = useCallback(
    async (type: "description" | "social") => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      const label = type === "description" ? "beschrijvingen" : "social posts";
      const toastId = toast.loading(`AI ${label} worden gegenereerd...`);

      try {
        const result = await triggerBulkAiGenerate(ids, type);
        if (!result.success || !result.data) {
          toast.error(result.success ? "Kon bulk AI niet starten" : result.error, { id: toastId });
          return;
        }

        const { runId } = result.data;
        setSelectedIds(new Set());

        // Poll progress
        bulkPollingRef.current = setInterval(async () => {
          try {
            const progress = await getBulkAiProgress(runId);
            if (progress.success && progress.data) {
              const { status, completed, total } = progress.data;
              if (status === "completed") {
                clearInterval(bulkPollingRef.current!);
                bulkPollingRef.current = null;
                toast.success(`${completed} ${label} gegenereerd`, { id: toastId });
                startTransition(async () => {
                  const fresh = await getMyPropertiesForDashboard(scope);
                  if (fresh.success && fresh.data) setProperties(fresh.data);
                });
              } else if (status === "failed") {
                clearInterval(bulkPollingRef.current!);
                bulkPollingRef.current = null;
                toast.error(`Bulk AI generatie mislukt`, { id: toastId });
              } else {
                toast.loading(`${completed} van ${total} ${label} klaar...`, { id: toastId });
              }
            }
          } catch {
            // Ignore polling errors
          }
        }, 3000);
      } catch {
        toast.error("Kon bulk AI niet starten", { id: toastId });
      }
    },
    [selectedIds, scope]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (bulkPollingRef.current) clearInterval(bulkPollingRef.current);
    };
  }, []);

  // Scope change (admin)
  const handleScopeChange = useCallback(
    async (newScope: "all" | "mine") => {
      updateParams({ scope: newScope === "mine" ? null : newScope });
      startTransition(async () => {
        const fresh = await getMyPropertiesForDashboard(newScope);
        if (fresh.success && fresh.data) setProperties(fresh.data);
      });
    },
    [updateParams]
  );

  // Shared view props — memoized to prevent unnecessary child re-renders
  const aiAction = canAi ? handleAiAction : undefined;
  const viewProps = useMemo(
    () => ({
      properties: filteredProperties,
      selectedIds,
      onToggleSelect: toggleSelect,
      onSelectAll: selectAll,
      allSelected,
      canBulkSelect,
      onStatusChange: handleStatusChange,
      onDuplicate: handleDuplicate,
      onArchive: handleArchive,
      onAiAction: aiAction,
      stalePropertyIds,
    }),
    [filteredProperties, selectedIds, toggleSelect, selectAll, allSelected, canBulkSelect, handleStatusChange, handleDuplicate, handleArchive, aiAction, stalePropertyIds]
  );

  const hasProperties = properties.length > 0;
  const hasResults = filteredProperties.length > 0;

  return (
    <ContentCard>
      <ContentCardHeader
        title="Panden"
        actions={
          can("properties:create") ? (
            <Link href="/dashboard/panden/nieuw">
              <Button size="sm" variant="ghost">
                <Plus className="h-4 w-4 mr-1.5" weight="bold" />
                Nieuw pand
              </Button>
            </Link>
          ) : undefined
        }
      >
        {hasProperties && (
          <PandenToolbar
            search={debouncedSearch}
            onSearchChange={handleSearchChange}
            statusFilter={statusFilter}
            onStatusFilterChange={(s) => updateParams({ status: s === "ALL" ? null : s })}
            statusCounts={statusCounts}
            viewMode={viewMode}
            onViewModeChange={(m) => updateParams({ view: m === "table" ? null : m })}
            sortBy={sortBy}
            onSortChange={(s) => updateParams({ sort: s === "newest" ? null : s })}
            isAdmin={isAdmin}
            scope={scope}
            onScopeChange={handleScopeChange}
          />
        )}
      </ContentCardHeader>

      {/* Portfolio Summary Widget */}
      {can("analytics:own") && hasProperties && initialSummary && (
        <PortfolioSummaryWidget initialSummary={initialSummary} />
      )}

      <ContentCardBody className={viewMode === "grid" ? "p-0" : "px-2"}>
        {!hasProperties ? (
          /* Empty state — no properties at all */
          <div className="flex h-[60vh] flex-col items-center justify-center text-center px-4">
            <div className="p-3 bg-muted rounded-md mb-4">
              <Buildings className="h-6 w-6 text-foreground" weight="regular" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Nog geen panden
            </h3>
            <p className="mb-6 text-sm text-muted-foreground max-w-md">
              Voeg je eerste horecapand toe en bereik duizenden ondernemers op
              het platform.
            </p>
            {can("properties:create") && (
              <Link href="/dashboard/panden/nieuw">
                <button className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent transition-colors">
                  <Plus className="mr-2 inline h-4 w-4" weight="bold" />
                  Eerste pand toevoegen
                </button>
              </Link>
            )}
          </div>
        ) : !hasResults ? (
          /* Empty state — filters active but no matches */
          <div className="flex h-[40vh] flex-col items-center justify-center text-center px-4">
            <div className="p-3 bg-muted rounded-md mb-4">
              <Buildings className="h-6 w-6 text-foreground" weight="regular" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Geen resultaten
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Pas je filters of zoekopdracht aan.
            </p>
            <button
              onClick={() => {
                setDebouncedSearch("");
                updateParams({ status: null, q: null, sort: null });
              }}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              Wis alle filters
            </button>
          </div>
        ) : (
          <>
            {viewMode === "table" && <PandenTableView {...viewProps} />}
            {viewMode === "list" && <PandenListView {...viewProps} />}
            {viewMode === "grid" && <PandenGridView {...viewProps} />}
          </>
        )}
      </ContentCardBody>

      {/* Floating bulk action bar */}
      {canBulkSelect && selectedIds.size > 0 && (
        <PandenBulkBar
          selectedCount={selectedIds.size}
          onStatusChange={handleBulkStatusChange}
          onArchive={handleBulkArchive}
          onClearSelection={() => setSelectedIds(new Set())}
          canAi={canAi}
          onBulkAiGenerate={handleBulkAiGenerate}
        />
      )}

      {/* AI Action Dialog */}
      <AiActionDialog
        open={aiDialog.open}
        onOpenChange={(open) =>
          setAiDialog((prev) => ({ ...prev, open }))
        }
        type={aiDialog.type}
        propertyTitle={aiDialog.propertyTitle}
        loading={aiDialog.loading}
        error={aiDialog.error}
        result={aiDialog.result}
      />
    </ContentCard>
  );
}

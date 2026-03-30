"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { EditableDataTable } from "@/components/data-table/editable";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { useDataTable } from "@/hooks/use-data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Eye,
  ShieldCheck,
  ShieldOff,
  Users,
  Building,
  Crown,
  Zap,
  Sparkles,
} from "lucide-react";
import { IconUserCog } from "@tabler/icons-react";
import { format } from "date-fns";
import { AgencyDetailModal } from "@/components/admin/agency-detail-modal";
import { updateAgencyVerified, updateAgencyPlan, getAgencyOwnerId } from "@/app/actions/admin/agencies";
import { impersonateUser } from "@/app/actions/admin/impersonate";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import type { Row } from "@tanstack/react-table";
import { toast } from "sonner";
import type { AdminAgency, AgencyPlan } from "@/types/admin";

interface AgenciesDataTableProps {
  data: AdminAgency[];
  pageCount: number;
  total: number;
}

const planIcons: Record<AgencyPlan, React.ReactNode> = {
  FREE: <Zap className="h-3 w-3" />,
  PRO: <Sparkles className="h-3 w-3" />,
  ENTERPRISE: <Crown className="h-3 w-3" />,
};

const planVariants: Record<AgencyPlan, "secondary" | "default" | "destructive"> = {
  FREE: "secondary",
  PRO: "default",
  ENTERPRISE: "destructive",
};

export function AgenciesDataTable({ data, pageCount }: AgenciesDataTableProps) {
  const router = useRouter();
  const { canEdit: canEditCol } = usePermissions();
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [selectedAgency, setSelectedAgency] = React.useState<AdminAgency | null>(null);
  const [isLoading, setIsLoading] = React.useState<string | null>(null);

  const handleVerifyToggle = React.useCallback(async (agency: AdminAgency) => {
    setIsLoading(agency.id);
    try {
      const result = await updateAgencyVerified({
        id: agency.id,
        verified: !agency.verified,
      });

      if (result.success) {
        toast.success(
          agency.verified
            ? "Agency unverified successfully"
            : "Agency verified successfully"
        );
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update verification status");
      }
    } catch (error) {
      console.error("Error toggling verification:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(null);
    }
  }, [router]);

  const handlePlanChange = React.useCallback(async (agency: AdminAgency, plan: AgencyPlan) => {
    if (plan === agency.plan) return;

    setIsLoading(agency.id);
    try {
      const result = await updateAgencyPlan({
        id: agency.id,
        plan,
      });

      if (result.success) {
        toast.success(`Plan updated to ${plan}`);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update plan");
      }
    } catch (error) {
      console.error("Error updating plan:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(null);
    }
  }, [router]);

  const handleImpersonateOwner = React.useCallback(async (agency: AdminAgency) => {
    if (!agency.owner) {
      toast.error("No owner found for this agency");
      return;
    }

    setIsLoading(agency.id);
    try {
      // Get owner ID
      const ownerResult = await getAgencyOwnerId(agency.id);
      if (!ownerResult.success || !ownerResult.data) {
        toast.error(ownerResult.success ? "Failed to get agency owner" : ownerResult.error);
        setIsLoading(null);
        return;
      }

      // Impersonate the owner
      const result = await impersonateUser(ownerResult.data);
      if (result.success) {
        toast.success(`Now impersonating ${agency.owner.name || agency.owner.email}`);
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to impersonate owner");
      }
    } catch (error) {
      console.error("Error impersonating owner:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(null);
    }
  }, [router]);

  const canEdit = React.useCallback(
    (_row: Row<AdminAgency>, columnId: string) =>
      canEditCol("admin-agencies", columnId),
    [canEditCol]
  );

  const handleCellSave = React.useCallback(
    async ({ row, columnId, value }: { row: any; columnId: string; value: unknown }) => {
      const agency = row.original;

      if (columnId === "plan") {
        const result = await updateAgencyPlan({
          id: agency.id,
          plan: value as AgencyPlan,
        });
        if (!result.success) {
          throw new Error(result.error || "Failed to update plan");
        }
      } else if (columnId === "verified") {
        const result = await updateAgencyVerified({
          id: agency.id,
          verified: value as boolean,
        });
        if (!result.success) {
          throw new Error(result.error || "Failed to update verification");
        }
      }

      router.refresh();
    },
    [router]
  );

  const columns = React.useMemo<ColumnDef<AdminAgency>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Agency" />
        ),
        cell: ({ row }) => {
          const agency = row.original;
          const initials = agency.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);

          return (
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80"
              onClick={() => {
                setSelectedAgency(agency);
                setDetailModalOpen(true);
              }}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={agency.image || undefined} alt={agency.name} />
                <AvatarFallback>
                  <Building className="h-4 w-4" />
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{agency.name}</span>
                <span className="text-sm text-muted-foreground">/{agency.slug}</span>
              </div>
            </div>
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        meta: {
          label: "Agency",
          placeholder: "Search agencies...",
          variant: "text",
        },
      },
      {
        id: "owner",
        accessorFn: (row) => row.owner?.email ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Owner" />
        ),
        cell: ({ row }) => {
          const owner = row.original.owner;
          if (!owner) {
            return <span className="text-muted-foreground text-sm">No owner</span>;
          }
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium">{owner.name || "No name"}</span>
              <span className="text-xs text-muted-foreground">{owner.email}</span>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "plan",
        accessorKey: "plan",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Plan" />
        ),
        cell: ({ row }) => {
          const plan = row.getValue("plan") as AgencyPlan;
          return (
            <Badge variant={planVariants[plan]} className="gap-1">
              {planIcons[plan]}
              {plan}
            </Badge>
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        meta: {
          label: "Plan",
          variant: "select",
          options: [
            { label: "Free", value: "FREE" },
            { label: "Pro", value: "PRO" },
            { label: "Enterprise", value: "ENTERPRISE" },
          ],
          editable: {
            type: "select",
            options: [
              { label: "Free", value: "FREE" },
              { label: "Pro", value: "PRO" },
              { label: "Enterprise", value: "ENTERPRISE" },
            ],
          },
        },
      },
      {
        id: "verified",
        accessorKey: "verified",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Verified" />
        ),
        cell: ({ row }) => {
          const verified = row.getValue("verified") as boolean;
          return (
            <Badge variant={verified ? "default" : "outline"} className="gap-1">
              {verified ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <ShieldOff className="h-3 w-3" />
              )}
              {verified ? "Verified" : "Unverified"}
            </Badge>
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        meta: {
          label: "Verified",
          variant: "select",
          options: [
            { label: "Verified", value: "true" },
            { label: "Unverified", value: "false" },
          ],
          editable: {
            type: "boolean",
          },
        },
      },
      {
        id: "listings",
        accessorFn: (row) => row._count?.listings ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Listings" />
        ),
        cell: ({ row }) => {
          const count = row.original._count?.listings ?? 0;
          return <span className="text-sm tabular-nums">{count}</span>;
        },
        enableSorting: true,
      },
      {
        id: "members",
        accessorFn: (row) => row._count?.members ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Members" />
        ),
        cell: ({ row }) => {
          const count = row.original._count?.members ?? 0;
          return (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm tabular-nums">{count}</span>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Created" />
        ),
        cell: ({ row }) => {
          const date = row.getValue("createdAt") as Date;
          return (
            <span className="text-sm">
              {format(new Date(date), "MMM d, yyyy")}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const agency = row.original;
          const loading = isLoading === agency.id;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedAgency(agency);
                    setDetailModalOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleVerifyToggle(agency)}>
                  {agency.verified ? (
                    <>
                      <ShieldOff className="h-4 w-4 mr-2" />
                      Unverify
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Verify
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Change Plan
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={agency.plan}
                      onValueChange={(value) =>
                        handlePlanChange(agency, value as AgencyPlan)
                      }
                    >
                      <DropdownMenuRadioItem value="FREE">
                        <Zap className="h-4 w-4 mr-2" />
                        Free
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="PRO">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Pro
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="ENTERPRISE">
                        <Crown className="h-4 w-4 mr-2" />
                        Enterprise
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleImpersonateOwner(agency)}
                  disabled={!agency.owner}
                >
                  <IconUserCog className="h-4 w-4 mr-2" />
                  Impersonate Owner
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [isLoading, handleVerifyToggle, handlePlanChange, handleImpersonateOwner]
  );

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    getRowId: (row) => row.id,
  });

  return (
    <>
      <EditableDataTable table={table} onCellSave={handleCellSave} canEdit={canEdit}>
        <DataTableToolbar table={table} />
      </EditableDataTable>

      {selectedAgency && (
        <AgencyDetailModal
          agency={selectedAgency}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
        />
      )}
    </>
  );
}

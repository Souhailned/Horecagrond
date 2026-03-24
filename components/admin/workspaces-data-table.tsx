"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { EditableDataTable } from "@/components/data-table/editable";
import { updateWorkspace } from "@/app/actions/admin/workspaces";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import type { Row } from "@tanstack/react-table";
import { toast } from "sonner";
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
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DotsThree, Pencil, Trash, Users } from "@phosphor-icons/react/dist/ssr"
import { WorkspaceEditDialog } from "@/components/admin/workspace-edit-dialog";
import { WorkspaceDeleteAlert } from "@/components/admin/workspace-delete-alert";
import { format } from "date-fns";
import type { AdminWorkspace } from "@/types/admin";
import type { EditableSelectOption } from "@/types/editable-data-table";

/** Demo combobox options for workspace type — replace with DB data later */
const WORKSPACE_TYPE_OPTIONS: EditableSelectOption[] = [
  { label: "Makelaarskantoor", value: "agency" },
  { label: "Persoonlijk", value: "personal" },
  { label: "Enterprise", value: "enterprise" },
];

interface WorkspacesDataTableProps {
  data: AdminWorkspace[];
  pageCount: number;
  total: number;
}

export function WorkspacesDataTable({ data, pageCount, total }: WorkspacesDataTableProps) {
  const router = useRouter();
  const { canEdit: canEditCol } = usePermissions();
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [deleteAlertOpen, setDeleteAlertOpen] = React.useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = React.useState<AdminWorkspace | null>(null);

  // Build O(1) lookup sets for uniqueness validation (js-set-map-lookups)
  const existingSlugs = React.useMemo(
    () => new Set(data.map((w) => w.slug)),
    [data]
  );
  const existingNames = React.useMemo(
    () => new Set(data.map((w) => w.name.toLowerCase())),
    [data]
  );

  const columns = React.useMemo<ColumnDef<AdminWorkspace>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Workspace" />
        ),
        cell: ({ row }) => {
          const workspace = row.original;
          const initials = workspace.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);

          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={workspace.image || undefined} alt={workspace.name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{workspace.name}</span>
                <span className="text-sm text-muted-foreground">/{workspace.slug}</span>
              </div>
            </div>
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        meta: {
          label: "Workspace",
          placeholder: "Search workspaces...",
          variant: "text",
          editable: {
            type: "text",
            validate: (v, ctx) => {
              const name = String(v ?? "").trim();
              if (!name) return "Naam is verplicht";
              if (name.length < 2) return "Minimaal 2 tekens";
              const original = String(ctx?.originalValue ?? "").toLowerCase();
              if (name.toLowerCase() !== original && existingNames.has(name.toLowerCase())) {
                return "Deze naam is al in gebruik";
              }
              return null;
            },
          },
        },
      },
      {
        id: "slug",
        accessorKey: "slug",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Slug" />
        ),
        cell: ({ row }) => {
          const slug = row.getValue("slug") as string;
          return (
            <Badge variant="outline" className="font-mono text-xs">
              {slug}
            </Badge>
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        meta: {
          label: "Slug",
          placeholder: "Search by slug...",
          variant: "text",
          editable: {
            type: "text",
            validate: (v, ctx) => {
              const slug = String(v ?? "").trim();
              if (!slug) return "Slug is verplicht";
              if (!/^[a-z0-9-]+$/.test(slug)) {
                return "Alleen kleine letters, cijfers en streepjes";
              }
              if (slug.length < 2) return "Minimaal 2 tekens";
              const original = String(ctx?.originalValue ?? "");
              if (slug !== original && existingSlugs.has(slug)) {
                return "Deze slug is al in gebruik";
              }
              return null;
            },
          },
        },
      },
      {
        id: "type",
        accessorFn: () => "personal",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Type" />
        ),
        cell: ({ row }) => {
          const val = row.getValue("type") as string;
          const opt = WORKSPACE_TYPE_OPTIONS.find((o) => o.value === val);
          return (
            <Badge variant="outline">{opt?.label ?? val}</Badge>
          );
        },
        meta: {
          label: "Type",
          editable: {
            type: "combobox" as const,
            options: WORKSPACE_TYPE_OPTIONS,
            placeholder: "Zoek type...",
          },
        },
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
              <span className="text-sm">{count}</span>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "invitations",
        accessorFn: (row) => row._count?.invitations ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Pending Invites" />
        ),
        cell: ({ row }) => {
          const count = row.original._count?.invitations ?? 0;
          return count > 0 ? (
            <Badge variant="secondary">{count}</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
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
          return <span className="text-sm">{format(new Date(date), "MMM d, yyyy")}</span>;
        },
        enableSorting: true,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const workspace = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <DotsThree className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedWorkspace(workspace);
                    setEditDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit workspace
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedWorkspace(workspace);
                    setDeleteAlertOpen(true);
                  }}
                  className="text-destructive"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [existingSlugs, existingNames]
  );

  const canEdit = React.useCallback(
    (_row: Row<AdminWorkspace>, columnId: string) =>
      canEditCol("admin-workspaces", columnId),
    [canEditCol]
  );

  const handleCellSave = React.useCallback(
    async ({ row, columnId, value }: { row: any; columnId: string; value: unknown }) => {
      const result = await updateWorkspace({
        id: row.original.id,
        [columnId]: value,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to update workspace");
      }
      router.refresh();
    },
    [router]
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

      {selectedWorkspace && (
        <>
          <WorkspaceEditDialog
            workspace={selectedWorkspace}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
          <WorkspaceDeleteAlert
            workspace={selectedWorkspace}
            open={deleteAlertOpen}
            onOpenChange={setDeleteAlertOpen}
          />
        </>
      )}
    </>
  );
}

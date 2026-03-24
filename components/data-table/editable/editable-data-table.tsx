"use client";

import * as React from "react";
import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCommonPinningStyles } from "@/lib/data-table";
import { cn } from "@/lib/utils";
import { useEditableCell } from "@/hooks/use-editable-cell";
import { useOptimisticUpdate } from "@/hooks/use-optimistic-update";
import { useCellNavigation } from "@/hooks/use-cell-navigation";
import type { Row } from "@tanstack/react-table";
import type { CellSaveHandler } from "@/types/editable-data-table";
import { EditableCell } from "./editable-cell";

interface EditableDataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>;
  onCellSave: CellSaveHandler<TData>;
  actionBar?: React.ReactNode;
  disabled?: boolean;
  /** Per-cell permission callback. Return false to disable editing for a specific cell. */
  canEdit?: (row: Row<TData>, columnId: string) => boolean;
}

export function EditableDataTable<TData>({
  table,
  onCellSave,
  actionBar,
  disabled = false,
  canEdit,
  children,
  className,
  ...props
}: EditableDataTableProps<TData>) {
  const { activeCell, startEdit, setDraftValue, save, cancel, isEditing } =
    useEditableCell();
  const { getOptimistic, setOptimistic, clearOptimistic, isPending } =
    useOptimisticUpdate();
  const [errorCells, setErrorCells] = React.useState<Set<string>>(
    () => new Set()
  );

  const rows = table.getRowModel().rows;
  const firstRowCols = rows[0]?.getVisibleCells().length ?? 0;
  const {
    focusedCell,
    setFocusedCell,
    isFocused,
    moveFocus,
    clearFocus,
  } = useCellNavigation(rows.length, firstRowCols);
  const tableRef = React.useRef<HTMLDivElement>(null);

  const handleSave = React.useCallback(
    async (rowId: string, columnId: string) => {
      if (!activeCell || activeCell.rowId !== rowId || activeCell.columnId !== columnId) {
        return;
      }

      const { draftValue, originalValue } = activeCell;
      const cellId = `${rowId}-${columnId}`;

      // Validate if validator provided
      const config = table
        .getRow(rowId)
        ?.getVisibleCells()
        .find((c) => c.column.id === columnId)
        ?.column.columnDef.meta?.editable;

      if (config?.validate) {
        const error = config.validate(draftValue, { originalValue });
        if (error) {
          toast.error(error);
          return;
        }
      }

      // Skip save if value unchanged
      if (draftValue === originalValue) {
        save();
        return;
      }

      // Apply optimistic update
      setOptimistic(cellId, draftValue);
      save();

      const row = table.getRow(rowId);
      if (!row) {
        clearOptimistic(cellId);
        return;
      }

      try {
        await onCellSave({
          row,
          columnId,
          value: draftValue,
          originalValue,
        });
        // Server confirmed — clear optimistic overlay
        clearOptimistic(cellId);
      } catch (err) {
        // Revert optimistic update
        clearOptimistic(cellId);
        // Flash error state
        setErrorCells((prev) => new Set(prev).add(cellId));
        setTimeout(() => {
          setErrorCells((prev) => {
            const next = new Set(prev);
            next.delete(cellId);
            return next;
          });
        }, 2000);
        toast.error(
          err instanceof Error ? err.message : "Failed to save changes"
        );
      }
    },
    [activeCell, save, setOptimistic, clearOptimistic, onCellSave, table]
  );

  // Keyboard handler: Arrow keys (navigation), Tab (edit next), Enter/F2 (start edit), Escape
  const handleTableKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      // --- When editing: handle Tab to move between editable cells ---
      if (activeCell) {
        if (e.key === "Tab") {
          e.preventDefault();
          const { rowId, columnId } = activeCell;
          const row = table.getRow(rowId);
          if (!row) return;

          const visibleCells = row.getVisibleCells();
          const currentIdx = visibleCells.findIndex(
            (c) => c.column.id === columnId
          );
          const direction = e.shiftKey ? -1 : 1;

          // Find next editable cell (skip cells blocked by canEdit)
          for (
            let i = currentIdx + direction;
            i >= 0 && i < visibleCells.length;
            i += direction
          ) {
            const nextCell = visibleCells[i];
            if (nextCell?.column.columnDef.meta?.editable) {
              const cellAllowed = canEdit ? canEdit(row, nextCell.column.id) : true;
              if (!cellAllowed) continue;
              void handleSave(rowId, columnId);
              startEdit(rowId, nextCell.column.id, nextCell.getValue());
              // Sync focus position
              const rowIdx = rows.findIndex((r) => r.id === rowId);
              setFocusedCell({ rowIndex: rowIdx, colIndex: i });
              return;
            }
          }

          // No more editable cells — just save
          void handleSave(rowId, columnId);
        }
        // Don't intercept other keys during edit — field inputs handle them
        return;
      }

      // --- When NOT editing: arrow keys navigate, Enter/F2 starts edit ---
      if (!focusedCell) {
        // First keypress activates focus on first cell
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          setFocusedCell({ rowIndex: 0, colIndex: 0 });
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveFocus("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveFocus("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          moveFocus("right");
          break;
        case "Enter":
        case "F2": {
          e.preventDefault();
          // Start editing the focused cell if it's editable and permitted
          const row = rows[focusedCell.rowIndex];
          if (!row) break;
          const cell = row.getVisibleCells()[focusedCell.colIndex];
          if (cell?.column.columnDef.meta?.editable && !disabled) {
            const cellAllowed = canEdit ? canEdit(row, cell.column.id) : true;
            if (cellAllowed) {
              startEdit(row.id, cell.column.id, cell.getValue());
            }
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          clearFocus();
          break;
      }
    },
    [
      activeCell,
      focusedCell,
      rows,
      table,
      disabled,
      canEdit,
      handleSave,
      startEdit,
      moveFocus,
      setFocusedCell,
      clearFocus,
    ]
  );

  return (
    <div
      ref={tableRef}
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      onKeyDown={handleTableKeyDown}
      {...props}
    >
      {children}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell, colIndex) => {
                    const cellId = `${row.id}-${cell.column.id}`;
                    const cellIsEditing = isEditing(row.id, cell.column.id);
                    const cellIsFocused = isFocused(rowIndex, colIndex);
                    const cellCanEdit = canEdit
                      ? canEdit(row, cell.column.id)
                      : true;
                    const cellDisabled = disabled || !cellCanEdit;

                    return (
                      <TableCell
                        key={cell.id}
                        style={{
                          ...getCommonPinningStyles({ column: cell.column }),
                        }}
                        onClick={() =>
                          setFocusedCell({ rowIndex, colIndex })
                        }
                      >
                        {cell.column.columnDef.meta?.editable ? (
                          <EditableCell
                            cell={cell}
                            isEditing={cellIsEditing}
                            isFocused={cellIsFocused}
                            isSaving={isPending(cellId)}
                            hasError={errorCells.has(cellId)}
                            disabled={cellDisabled}
                            optimisticValue={getOptimistic(cellId)}
                            draftValue={
                              cellIsEditing
                                ? (activeCell?.draftValue ?? cell.getValue())
                                : cell.getValue()
                            }
                            onStartEdit={() => {
                              setFocusedCell({ rowIndex, colIndex });
                              startEdit(
                                row.id,
                                cell.column.id,
                                cell.getValue()
                              );
                            }}
                            onDraftChange={setDraftValue}
                            onSave={() =>
                              void handleSave(row.id, cell.column.id)
                            }
                            onCancel={cancel}
                          />
                        ) : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination table={table} />
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  );
}

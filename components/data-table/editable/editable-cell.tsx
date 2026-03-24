"use client";

import * as React from "react";
import type { Cell } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type {
  EditableColumnConfig,
  EditableFieldType,
  FieldInputProps,
} from "@/types/editable-data-table";
import {
  TextFieldInput,
  NumberFieldInput,
  SelectFieldInput,
  ComboboxFieldInput,
  DateFieldInput,
  BooleanFieldInput,
  CurrencyFieldInput,
} from "./field-inputs";

const FIELD_INPUT_MAP: Record<
  EditableFieldType,
  React.ComponentType<FieldInputProps>
> = {
  text: TextFieldInput,
  number: NumberFieldInput,
  select: SelectFieldInput,
  combobox: ComboboxFieldInput,
  date: DateFieldInput,
  boolean: BooleanFieldInput,
  currency: CurrencyFieldInput,
};

interface EditableCellProps<TData> {
  cell: Cell<TData, unknown>;
  isEditing: boolean;
  isFocused: boolean;
  isSaving: boolean;
  hasError: boolean;
  disabled: boolean;
  optimisticValue: unknown | undefined;
  draftValue: unknown;
  onStartEdit: () => void;
  onDraftChange: (value: unknown) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditableCell<TData>({
  cell,
  isEditing,
  isFocused,
  isSaving,
  hasError,
  disabled,
  optimisticValue,
  draftValue,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
}: EditableCellProps<TData>) {
  const cellRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll focused cell into view and focus the DOM element
  React.useEffect(() => {
    if (isFocused && !isEditing && cellRef.current) {
      cellRef.current.focus({ preventScroll: false });
      cellRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [isFocused, isEditing]);
  const config = cell.column.columnDef.meta?.editable as
    | EditableColumnConfig
    | undefined;

  // Not editable — render normally
  if (!config) {
    return flexRender(cell.column.columnDef.cell, cell.getContext());
  }

  // Edit mode
  if (isEditing && !disabled) {
    const FieldInput = FIELD_INPUT_MAP[config.type];

    return (
      <div className="relative -m-1">
        <FieldInput
          value={draftValue}
          onChange={onDraftChange}
          onSave={onSave}
          onCancel={onCancel}
          config={config}
          autoFocus
        />
      </div>
    );
  }

  // Display mode — show optimistic value if present, otherwise normal render
  const displayValue =
    optimisticValue !== undefined ? optimisticValue : undefined;

  return (
    <div
      ref={cellRef}
      role="button"
      tabIndex={isFocused ? 0 : -1}
      onClick={disabled ? undefined : onStartEdit}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === "F2")) {
          e.preventDefault();
          onStartEdit();
        }
      }}
      className={cn(
        "group/editable-cell relative -m-1 cursor-pointer rounded-sm px-1 py-0.5 transition-colors outline-none",
        !disabled && "hover:bg-muted/60 hover:ring-1 hover:ring-border",
        isFocused && !isEditing && "ring-2 ring-primary/50 bg-muted/40",
        isSaving && "animate-pulse",
        hasError && "ring-2 ring-destructive/50",
        disabled && "cursor-default opacity-70"
      )}
    >
      {displayValue !== undefined
        ? config.formatDisplay
          ? config.formatDisplay(displayValue)
          : String(displayValue ?? "")
        : flexRender(cell.column.columnDef.cell, cell.getContext())}

      {isSaving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <Spinner className="size-3" />
        </span>
      )}
    </div>
  );
}

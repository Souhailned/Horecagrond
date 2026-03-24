import type * as React from "react";
import type { Row } from "@tanstack/react-table";

/**
 * Supported field types for inline editing
 */
export type EditableFieldType =
  | "text"
  | "number"
  | "select"
  | "combobox"
  | "date"
  | "boolean"
  | "currency";

/**
 * Option type for select fields (mirrors Option from data-table.ts)
 */
export interface EditableSelectOption {
  label: string;
  value: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

/**
 * A labelled group of options for combobox fields
 */
export interface EditableOptionGroup {
  label: string;
  options: EditableSelectOption[];
}

export interface EditableColumnConfig {
  /** Which field input to render */
  type: EditableFieldType;
  /** Options for select/combobox fields */
  options?: EditableSelectOption[];
  /** Grouped options for combobox fields (takes precedence over flat options) */
  groups?: EditableOptionGroup[];
  /** Placeholder text for the combobox search input */
  placeholder?: string;
  /** Min value for number/currency fields */
  min?: number;
  /** Max value for number/currency fields */
  max?: number;
  /** Step for number fields */
  step?: number;
  /** Currency symbol prefix (default: "\u20AC") */
  currencySymbol?: string;
  /** Optional validation — return error string or null.
   *  Second arg provides context: originalValue for uniqueness checks. */
  validate?: (value: unknown, context?: { originalValue: unknown }) => string | null;
  /** Optional display formatter */
  formatDisplay?: (value: unknown) => string;
}

/**
 * State of a cell currently being edited
 */
export interface CellEditState {
  /** Composite key: `${rowId}-${columnId}` */
  cellId: string;
  rowId: string;
  columnId: string;
  /** Current draft value in the input */
  draftValue: unknown;
  /** Original value before editing started */
  originalValue: unknown;
}

/**
 * Callback when a cell save is triggered
 */
export type CellSaveHandler<TData> = (params: {
  row: Row<TData>;
  columnId: string;
  value: unknown;
  originalValue: unknown;
}) => Promise<void>;

/**
 * Props shared by all field input components
 */
export interface FieldInputProps {
  value: unknown;
  onChange: (value: unknown) => void;
  onSave: () => void;
  onCancel: () => void;
  config: EditableColumnConfig;
  autoFocus?: boolean;
}

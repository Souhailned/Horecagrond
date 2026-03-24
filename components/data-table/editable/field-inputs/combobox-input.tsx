"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type {
  EditableSelectOption,
  FieldInputProps,
} from "@/types/editable-data-table";

/**
 * Searchable combobox field input for EditableDataTable.
 *
 * Supports flat options (`config.options`) and grouped options (`config.groups`).
 * Uses the same `savedRef` save/cancel pattern as SelectFieldInput.
 *
 * Data flow: Server Component fetches from DB → passes options via column config →
 *   ComboboxFieldInput renders them with search.
 */
export function ComboboxFieldInput({
  value,
  onChange,
  onSave,
  onCancel,
  config,
  autoFocus,
}: FieldInputProps) {
  const savedRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(true);
  const currentValue = String(value ?? "");

  // Cleanup deferred timers on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-focus the search input when mounted (keyboard workflow)
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Build O(1) lookup map for label resolution
  const optionsMap = React.useMemo(() => {
    const map = new Map<string, EditableSelectOption>();
    if (config.groups?.length) {
      for (const group of config.groups) {
        for (const opt of group.options) {
          map.set(opt.value, opt);
        }
      }
    } else if (config.options) {
      for (const opt of config.options) {
        map.set(opt.value, opt);
      }
    }
    return map;
  }, [config.groups, config.options]);

  // Resolve display label — use formatDisplay if provided, else option label
  const displayLabel = React.useMemo(() => {
    if (config.formatDisplay) return config.formatDisplay(currentValue);
    return optionsMap.get(currentValue)?.label ?? currentValue;
  }, [currentValue, config.formatDisplay, optionsMap]);

  // Save with deferred timeout (same pattern as SelectFieldInput)
  const deferredSave = React.useCallback(() => {
    savedRef.current = true;
    timerRef.current = setTimeout(onSave, 0);
  }, [onSave]);

  // Save immediately on selection
  const handleSelect = React.useCallback(
    (selectedValue: string) => {
      // Same value selected — still call onSave to exit edit mode cleanly (no-op save)
      if (selectedValue === currentValue) {
        deferredSave();
        return;
      }
      onChange(selectedValue);
      deferredSave();
    },
    [currentValue, onChange, deferredSave]
  );

  // Cancel on dismiss unless we already saved
  const handleOpenChange = React.useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen && !savedRef.current) {
        onCancel();
      }
    },
    [onCancel]
  );

  // Shared item renderer — eliminates duplication between flat/grouped rendering
  // Uses `keywords` for cmdk search filtering, `value` stays unique per option
  const renderItem = React.useCallback(
    (option: EditableSelectOption) => (
      <CommandItem
        key={option.value}
        value={option.value}
        keywords={[option.label]}
        onSelect={() => handleSelect(option.value)}
        className="gap-2"
      >
        {option.icon && <option.icon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="truncate">{option.label}</span>
        <Check
          className={cn(
            "ml-auto size-4 shrink-0",
            currentValue === option.value ? "opacity-100" : "opacity-0"
          )}
        />
      </CommandItem>
    ),
    [currentValue, handleSelect]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-sm border bg-background px-2 text-sm",
            "ring-2 ring-ring ring-offset-1"
          )}
        >
          <span className="truncate text-left">
            {displayLabel || "Selecteer..."}
          </span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0"
        align="start"
        sideOffset={2}
      >
        <Command>
          <CommandInput
            ref={inputRef}
            placeholder={config.placeholder ?? "Zoeken..."}
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              Geen resultaten gevonden.
            </CommandEmpty>
            {config.groups?.length ? (
              config.groups.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.options.map(renderItem)}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {(config.options ?? []).map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

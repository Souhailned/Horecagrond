"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  X,
  ArrowsClockwise,
  Archive,
  TextAa,
  ShareNetwork,
} from "@phosphor-icons/react/dist/ssr";

interface PandenBulkBarProps {
  selectedCount: number;
  onStatusChange: (status: string) => void;
  onArchive: () => void;
  onClearSelection: () => void;
  canAi?: boolean;
  onBulkAiGenerate?: (type: "description" | "social") => void;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Concept" },
  { value: "ACTIVE", label: "Actief" },
  { value: "UNDER_OFFER", label: "Onder bod" },
  { value: "RENTED", label: "Verhuurd" },
  { value: "SOLD", label: "Verkocht" },
] as const;

export function PandenBulkBar({
  selectedCount,
  onStatusChange,
  onArchive,
  onClearSelection,
  canAi,
  onBulkAiGenerate,
}: PandenBulkBarProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClearSelection]);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          role="toolbar"
          aria-label="Bulkacties voor geselecteerde panden"
          aria-orientation="horizontal"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit items-center gap-2 rounded-md border bg-background p-2 text-foreground shadow-sm"
        >
          {/* Selection count */}
          <div className="flex h-7 items-center rounded-md border pr-1 pl-2.5">
            <span className="whitespace-nowrap text-xs">
              {selectedCount} geselecteerd
            </span>
            <Separator
              orientation="vertical"
              className="mr-1 ml-2 data-[orientation=vertical]:h-4"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={onClearSelection}
              aria-label="Selectie wissen"
            >
              <X className="size-3.5" weight="bold" />
            </Button>
          </div>

          {/* Status change dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-secondary bg-secondary/50 hover:bg-secondary/70 h-7 text-xs"
              >
                <ArrowsClockwise className="size-3.5" weight="bold" />
                Status wijzigen
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => onStatusChange(opt.value)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Archive */}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 border border-secondary bg-secondary/50 hover:bg-destructive/10 hover:text-destructive h-7 text-xs"
            onClick={onArchive}
          >
            <Archive className="size-3.5" weight="bold" />
            Archiveren
          </Button>

          {/* AI Bulk Operations */}
          {canAi && onBulkAiGenerate && (
            <>
              <Separator
                orientation="vertical"
                className="data-[orientation=vertical]:h-4"
              />
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-secondary bg-secondary/50 hover:bg-primary/10 hover:text-primary h-7 text-xs"
                onClick={() => onBulkAiGenerate("description")}
              >
                <TextAa className="size-3.5" weight="bold" />
                AI beschrijvingen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-secondary bg-secondary/50 hover:bg-primary/10 hover:text-primary h-7 text-xs"
                onClick={() => onBulkAiGenerate("social")}
              >
                <ShareNetwork className="size-3.5" weight="bold" />
                AI social posts
              </Button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    globalThis.document?.body
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["Delete", "Backspace"], action: "Geselecteerde elementen verwijderen" },
  { keys: ["Enter"], action: "Tekening afronden (muur/zone)" },
  { keys: ["Escape"], action: "Tekening annuleren / deselecteren" },
  { keys: ["R"], action: "Geselecteerd item 90\u00B0 draaien" },
  { keys: ["G"], action: "Raster aan/uit" },
  { keys: ["Ctrl+Z"], action: "Ongedaan maken" },
  { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], action: "Opnieuw uitvoeren" },
  { keys: ["Ctrl+C"], action: "Selectie kopieren" },
  { keys: ["Ctrl+V"], action: "Plakken" },
  { keys: ["?"], action: "Deze sneltoetsen tonen" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sneltoetsen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-1">
              <span className="text-sm text-foreground">{s.action}</span>
              <div className="flex gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex h-6 items-center rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

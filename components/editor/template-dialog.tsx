"use client";

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useSceneStore } from "@/lib/editor/stores";
import { TEMPLATES, type FloorPlanTemplate } from "@/lib/editor/templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function TemplateDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const loadScene = useSceneStore((s) => s.loadScene);
  const nodes = useSceneStore((s) => s.nodes);

  const handleApply = () => {
    const template = TEMPLATES.find((t) => t.id === selected);
    if (!template) return;

    // Warn if scene is not empty
    if (Object.keys(nodes).length > 0) {
      if (!confirm("Dit overschrijft de huidige plattegrond. Doorgaan?")) return;
    }

    loadScene(template.sceneData);
    toast.success(`Template "${template.name}" geladen`);
    setOpen(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="gap-1.5"
            >
              <LayoutTemplate className="size-4" />
              <span className="hidden sm:inline">Templates</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Laad een plattegrond template
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="size-5 text-primary" />
            Plattegrond Templates
          </DialogTitle>
          <DialogDescription>
            Kies een template als startpunt voor uw plattegrond.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent",
                selected === t.id &&
                  "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {t.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.surfaceM2} m\u00B2
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {t.description}
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={handleApply} disabled={!selected}>
            <LayoutTemplate className="mr-2 size-4" />
            Toepassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { generateAiFloorPlan } from "@/app/actions/ai-floor-plan";
import { useSceneStore } from "@/lib/editor/stores";

const PROPERTY_TYPES = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Cafe" },
  { value: "BAR", label: "Bar" },
  { value: "HOTEL", label: "Hotel" },
  { value: "EETCAFE", label: "Eetcafe" },
  { value: "LUNCHROOM", label: "Lunchroom" },
  { value: "KOFFIEBAR", label: "Koffiebar" },
  { value: "PIZZERIA", label: "Pizzeria" },
  { value: "BAKERY", label: "Bakkerij" },
  { value: "SNACKBAR", label: "Snackbar" },
] as const;

export function AiGenerateDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [surfaceTotal, setSurfaceTotal] = useState<string>("100");
  const [propertyType, setPropertyType] = useState<string>("RESTAURANT");
  const [seatingCapacity, setSeatingCapacity] = useState<string>("");
  const [hasKitchen, setHasKitchen] = useState(true);
  const [hasTerrace, setHasTerrace] = useState(false);
  const [hasStorage, setHasStorage] = useState(true);

  const resetForm = useCallback(() => {
    setSurfaceTotal("100");
    setPropertyType("RESTAURANT");
    setSeatingCapacity("");
    setHasKitchen(true);
    setHasTerrace(false);
    setHasStorage(true);
  }, []);

  const handleSubmit = () => {
    const surface = Number(surfaceTotal);
    if (!surface || surface < 10 || surface > 10000) {
      toast.error("Voer een geldige oppervlakte in (10-10.000 m\u00B2).");
      return;
    }

    startTransition(async () => {
      const result = await generateAiFloorPlan({
        surfaceTotal: surface,
        propertyType,
        seatingCapacityInside: seatingCapacity
          ? Number(seatingCapacity)
          : undefined,
        hasKitchen,
        hasTerrace,
        hasStorage,
      });

      if (result.success && result.data) {
        useSceneStore.getState().loadScene(result.data);
        toast.success("Plattegrond gegenereerd!");
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error ?? "Er ging iets mis bij het genereren.");
      }
    });
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
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">AI Genereren</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Genereer plattegrond met AI
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            AI Plattegrond Genereren
          </DialogTitle>
          <DialogDescription>
            Vul de gegevens in en laat AI een plattegrond genereren voor uw
            horecapand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Surface total */}
          <div className="grid gap-2">
            <Label htmlFor="ai-surface">Oppervlakte (m\u00B2) *</Label>
            <Input
              id="ai-surface"
              type="number"
              min={10}
              max={10000}
              value={surfaceTotal}
              onChange={(e) => setSurfaceTotal(e.target.value)}
              placeholder="bijv. 120"
              disabled={isPending}
            />
          </div>

          {/* Property type */}
          <div className="grid gap-2">
            <Label htmlFor="ai-type">Type pand *</Label>
            <Select
              value={propertyType}
              onValueChange={setPropertyType}
              disabled={isPending}
            >
              <SelectTrigger id="ai-type">
                <SelectValue placeholder="Selecteer type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seating capacity */}
          <div className="grid gap-2">
            <Label htmlFor="ai-seats">Zitplaatsen (optioneel)</Label>
            <Input
              id="ai-seats"
              type="number"
              min={1}
              max={1000}
              value={seatingCapacity}
              onChange={(e) => setSeatingCapacity(e.target.value)}
              placeholder="bijv. 60"
              disabled={isPending}
            />
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-kitchen"
                checked={hasKitchen}
                onCheckedChange={(checked) =>
                  setHasKitchen(checked === true)
                }
                disabled={isPending}
              />
              <Label htmlFor="ai-kitchen" className="cursor-pointer">
                Keuken
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-terrace"
                checked={hasTerrace}
                onCheckedChange={(checked) =>
                  setHasTerrace(checked === true)
                }
                disabled={isPending}
              />
              <Label htmlFor="ai-terrace" className="cursor-pointer">
                Terras
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-storage"
                checked={hasStorage}
                onCheckedChange={(checked) =>
                  setHasStorage(checked === true)
                }
                disabled={isPending}
              />
              <Label htmlFor="ai-storage" className="cursor-pointer">
                Opslag
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Annuleren
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Genereren...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" />
                Genereren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

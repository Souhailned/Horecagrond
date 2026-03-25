"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import dynamic from "next/dynamic";
import { saveFloorPlan, deleteFloorPlan } from "@/app/actions/floor-plans";
import type { FloorPlanData } from "@/app/actions/floor-plans";
import type { SceneData } from "@/lib/editor/schema";
import { useSceneMeasurements } from "@/lib/editor/systems";
import { useSceneStore } from "@/lib/editor/stores";
import { useDebouncedCallback } from "use-debounce";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PropertyEditor = dynamic(
  () =>
    import("@/components/editor/property-editor").then((mod) => ({
      default: mod.PropertyEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
        Editor laden...
      </div>
    ),
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFloorLabel(floor: number): string {
  if (floor < 0) return "Kelder";
  if (floor === 0) return "Begane grond";
  if (floor === 1) return "1e verdieping";
  if (floor === 2) return "2e verdieping";
  if (floor === 3) return "3e verdieping";
  return `${floor}e verdieping`;
}

function getNextFloor(floorPlans: FloorPlanData[]): number {
  if (floorPlans.length === 0) return 0;
  const maxFloor = Math.max(...floorPlans.map((fp) => fp.floor));
  return maxFloor + 1;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloorPlanEditorClientProps {
  propertyId: string;
  initialFloorPlans: FloorPlanData[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloorPlanEditorClient({
  propertyId,
  initialFloorPlans,
}: FloorPlanEditorClientProps) {
  const [floorPlans, setFloorPlans] =
    useState<FloorPlanData[]>(initialFloorPlans);
  const [activeFloor, setActiveFloor] = useState<number | null>(
    floorPlans.length > 0 ? floorPlans[0].floor : null
  );
  const [isPending, startTransition] = useTransition();
  const measurements = useSceneMeasurements();

  const activeFloorPlan = floorPlans.find((fp) => fp.floor === activeFloor);

  // -------------------------------------------------------------------------
  // Auto-save state
  // -------------------------------------------------------------------------

  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // -------------------------------------------------------------------------
  // Add floor
  // -------------------------------------------------------------------------

  const handleAddFloor = useCallback(() => {
    const nextFloor = getNextFloor(floorPlans);
    const name = getFloorLabel(nextFloor);

    startTransition(async () => {
      const result = await saveFloorPlan({
        propertyId,
        floor: nextFloor,
        name,
        sceneData: { nodes: {}, rootNodeIds: [] },
      });

      if (result.success && result.data) {
        const newPlan: FloorPlanData = {
          id: result.data.id,
          propertyId,
          floor: nextFloor,
          name,
          sceneData: { nodes: {}, rootNodeIds: [] },
          totalArea: null,
          zones: null,
          thumbnailUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setFloorPlans((prev) =>
          [...prev, newPlan].sort((a, b) => a.floor - b.floor)
        );
        setActiveFloor(nextFloor);
        toast.success(`${name} toegevoegd`);
      } else {
        toast.error(result.error ?? "Kon verdieping niet toevoegen");
      }
    });
  }, [floorPlans, propertyId]);

  // -------------------------------------------------------------------------
  // Delete floor
  // -------------------------------------------------------------------------

  const handleDeleteFloor = useCallback(
    (floorPlan: FloorPlanData) => {
      startTransition(async () => {
        const result = await deleteFloorPlan({ id: floorPlan.id });

        if (result.success) {
          setFloorPlans((prev) => {
            const updated = prev.filter((fp) => fp.id !== floorPlan.id);
            if (activeFloor === floorPlan.floor) {
              setActiveFloor(updated.length > 0 ? updated[0].floor : null);
            }
            return updated;
          });
          toast.success(`${floorPlan.name} verwijderd`);
        } else {
          toast.error(result.error ?? "Kon verdieping niet verwijderen");
        }
      });
    },
    [activeFloor]
  );

  // -------------------------------------------------------------------------
  // Save scene
  // -------------------------------------------------------------------------

  const handleSave = useCallback(
    (scene: SceneData) => {
      if (activeFloorPlan == null) return;

      const zoneSummaries = measurements.zones.reduce<Record<string, unknown>>(
        (acc, z) => {
          acc[z.id] = {
            zoneType: z.zoneType,
            area: z.area,
            capacity: z.capacity,
          };
          return acc;
        },
        {}
      );

      startTransition(async () => {
        const result = await saveFloorPlan({
          propertyId,
          floor: activeFloorPlan.floor,
          name: activeFloorPlan.name,
          sceneData: { nodes: (scene as SceneData).nodes as unknown as Record<string, unknown>, rootNodeIds: (scene as SceneData).rootNodeIds },
          totalArea: measurements.totalArea,
          zones: zoneSummaries,
        });

        if (result.success) {
          setFloorPlans((prev) =>
            prev.map((fp) =>
              fp.floor === activeFloorPlan.floor
                ? {
                    ...fp,
                    sceneData: scene as unknown as FloorPlanData["sceneData"],
                    totalArea: measurements.totalArea,
                    zones: zoneSummaries as unknown as FloorPlanData["zones"],
                    updatedAt: new Date(),
                  }
                : fp
            )
          );
          toast.success("Plattegrond opgeslagen");
        } else {
          toast.error(result.error ?? "Opslaan mislukt");
        }
      });
    },
    [activeFloorPlan, measurements, propertyId]
  );

  // -------------------------------------------------------------------------
  // Auto-save with debounce (3s after last scene change)
  // -------------------------------------------------------------------------

  const debouncedAutoSave = useDebouncedCallback(() => {
    if (!activeFloorPlan) return;
    setIsSaving(true);
    const scene = useSceneStore.getState().exportScene();
    handleSave(scene);
    setLastSaved(new Date());
    setIsSaving(false);
  }, 3000);

  // Subscribe to scene store changes
  useEffect(() => {
    const unsub = useSceneStore.subscribe((state) => {
      // Only auto-save when there are nodes (non-empty scene)
      if (Object.keys(state.nodes).length > 0) {
        debouncedAutoSave();
      }
    });
    return () => unsub();
  }, [debouncedAutoSave]);

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (floorPlans.length === 0 && activeFloor === null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="p-3 bg-muted rounded-md mb-4">
          <Layers className="h-6 w-6 text-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Nog geen plattegronden
        </h3>
        <p className="mb-6 text-sm text-muted-foreground max-w-md">
          Begin met het aanmaken van een verdieping om de 3D plattegrond editor
          te gebruiken.
        </p>
        <Button onClick={handleAddFloor} disabled={isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          Begin met plattegrond
        </Button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Floor selector bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto">
        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground shrink-0 mr-1">
          Verdiepingen:
        </span>

        {floorPlans.map((fp) => (
          <div key={fp.id} className="flex items-center gap-0.5 shrink-0">
            <Button
              variant={activeFloor === fp.floor ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs",
                activeFloor === fp.floor && "pointer-events-none"
              )}
              onClick={() => setActiveFloor(fp.floor)}
            >
              {fp.name}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {fp.name} verwijderen?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Deze actie kan niet ongedaan worden gemaakt. De plattegrond
                    en alle bijbehorende gegevens worden permanent verwijderd.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteFloor(fp)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={handleAddFloor}
          disabled={isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nieuwe verdieping
        </Button>

        {/* Measurement summary */}
        {activeFloorPlan && measurements.totalArea > 0 && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {measurements.totalArea.toFixed(1)} m² totaal
          </span>
        )}

        {/* Auto-save indicator */}
        {lastSaved && (
          <span className={cn(
            "text-xs text-muted-foreground shrink-0",
            !(activeFloorPlan && measurements.totalArea > 0) && "ml-auto"
          )}>
            {isSaving
              ? "Opslaan..."
              : `Opgeslagen ${lastSaved.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
        )}
      </div>

      {/* Editor */}
      {activeFloorPlan && (
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <PropertyEditor
            key={activeFloorPlan.id}
            propertyId={propertyId}
            floorPlanId={activeFloorPlan.id}
            initialScene={
              activeFloorPlan.sceneData as unknown as SceneData | undefined
            }
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  );
}

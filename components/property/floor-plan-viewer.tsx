"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Layers, Box, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Use the Pascal editor in read-only preview mode
const Editor = dynamic(
  () =>
    import("@pascal-app/editor").then((mod) => ({
      default: mod.Editor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px] bg-muted/30 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-pulse rounded-lg bg-muted" />
          <span className="text-muted-foreground text-sm">
            Plattegrond laden...
          </span>
        </div>
      </div>
    ),
  }
);

interface FloorPlanData {
  id: string;
  name: string;
  floor: number;
  sceneData: unknown;
  totalArea: number | null;
}

interface FloorPlanViewerProps {
  propertyId: string;
  floorPlans: FloorPlanData[];
}

type SceneGraph = {
  nodes: Record<string, unknown>;
  rootNodeIds: string[];
};

function getFloorLabel(floor: number): string {
  if (floor === -1) return "Kelder";
  if (floor === 0) return "Begane grond";
  if (floor === 1) return "1e verdieping";
  if (floor === 2) return "2e verdieping";
  if (floor === 3) return "3e verdieping";
  return `${floor}e verdieping`;
}

export function FloorPlanViewer({
  propertyId,
  floorPlans,
}: FloorPlanViewerProps) {
  const [selectedFloorId, setSelectedFloorId] = useState<string>(
    floorPlans[0]?.id ?? ""
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const sortedFloors = [...floorPlans].sort((a, b) => a.floor - b.floor);
  const selectedFloor = sortedFloors.find((fp) => fp.id === selectedFloorId);

  if (floorPlans.length === 0) {
    return null;
  }

  const sceneData = selectedFloor?.sceneData as SceneGraph | undefined;

  return (
    <Card ref={containerRef} className={cn(isFullscreen && "flex flex-col h-screen rounded-none border-none shadow-none bg-background")}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Maximize2 className="size-5 text-muted-foreground" />
          <CardTitle className="text-lg">Plattegrond</CardTitle>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {isFullscreen ? "Sluiten" : "Volledig scherm"}
            </span>
          </Button>
        </div>
      </CardHeader>

      {sortedFloors.length > 1 && (
        <div className="flex items-center gap-1.5 px-6 pb-3">
          {sortedFloors.map((fp) => (
            <Button
              key={fp.id}
              variant={fp.id === selectedFloorId ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs",
                fp.id === selectedFloorId && "pointer-events-none"
              )}
              onClick={() => setSelectedFloorId(fp.id)}
            >
              {getFloorLabel(fp.floor)}
              {fp.totalArea != null && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1 h-4 px-1 text-[10px] leading-none",
                    fp.id === selectedFloorId &&
                      "bg-primary-foreground/20 text-primary-foreground"
                  )}
                >
                  {fp.totalArea} m&sup2;
                </Badge>
              )}
            </Button>
          ))}
        </div>
      )}

      <Separator />

      <CardContent className={cn("p-0", isFullscreen && "flex-1")}>
        <div
          className={cn(
            "relative min-h-[400px] max-h-[600px] h-[50vh]",
            isFullscreen && "min-h-0 max-h-none h-full"
          )}
        >
          {sceneData?.nodes && sceneData?.rootNodeIds ? (
            <div className="h-full w-full dark">
              <Editor
                projectId={`viewer-${propertyId}-${selectedFloor?.id}`}
                previewScene={sceneData}
                isVersionPreviewMode
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-muted/20">
              <p className="text-sm text-muted-foreground">
                Geen plattegronddata beschikbaar voor deze verdieping.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cloud, CloudOff, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFloorPlan } from "@/app/actions/floor-plans";
import { toast } from "sonner";
import type { SaveStatus } from "@pascal-app/editor";
import { AiCommandsProvider } from "@/components/editor/ai-commands-provider";

// Dynamic import to avoid SSR issues with Three.js
const Editor = dynamic(
  () => import("@pascal-app/editor").then((mod) => ({ default: mod.Editor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Editor laden...
      </div>
    ),
  }
);

type SceneGraph = {
  nodes: Record<string, unknown>;
  rootNodeIds: string[];
};

interface PascalEditorWrapperProps {
  propertyId: string;
  propertyTitle: string;
  floorPlanId: string | null;
  initialScene: Record<string, unknown> | null;
  backHref: string;
}

const SAVE_STATUS_CONFIG: Record<SaveStatus, { icon: typeof Cloud; label: string; className: string }> = {
  idle: { icon: Cloud, label: "", className: "text-muted-foreground" },
  pending: { icon: Loader2, label: "Wijzigingen...", className: "text-amber-500" },
  saving: { icon: Loader2, label: "Opslaan...", className: "text-amber-500 animate-spin" },
  saved: { icon: Check, label: "Opgeslagen", className: "text-emerald-500" },
  paused: { icon: Cloud, label: "Gepauzeerd", className: "text-muted-foreground" },
  error: { icon: CloudOff, label: "Fout bij opslaan", className: "text-destructive" },
};

export function PascalEditorWrapper({
  propertyId,
  propertyTitle,
  floorPlanId: initialFloorPlanId,
  initialScene,
  backHref,
}: PascalEditorWrapperProps) {
  const floorPlanIdRef = useRef<string | null>(initialFloorPlanId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Load scene from database.
  // Always return a valid SceneGraph structure (never null) so the editor
  // never accesses .length on an undefined rootNodeIds during init.
  const handleLoad = useCallback(async (): Promise<SceneGraph> => {
    if (!initialScene) return { nodes: {}, rootNodeIds: [] };

    const scene = initialScene as unknown as SceneGraph;
    if (
      scene.nodes &&
      typeof scene.nodes === "object" &&
      Array.isArray(scene.rootNodeIds)
    ) {
      return scene;
    }
    return { nodes: {}, rootNodeIds: [] };
  }, [initialScene]);

  // Save scene to database
  const handleSave = useCallback(
    async (scene: SceneGraph) => {
      const result = await saveFloorPlan({
        propertyId,
        floor: 0,
        name: "Begane grond",
        sceneData: scene as unknown as Parameters<typeof saveFloorPlan>[0]["sceneData"],
      });

      if (!result.success) {
        toast.error(result.error ?? "Opslaan mislukt");
        throw new Error(result.error ?? "Save failed");
      }

      if (result.data?.id) {
        floorPlanIdRef.current = result.data.id;
      }
    },
    [propertyId]
  );

  // Save status change handler
  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
  }, []);

  // Back button with save status indicator
  const statusConfig = SAVE_STATUS_CONFIG[saveStatus];
  const StatusIcon = statusConfig.icon;

  const sidebarTop = (
    <div className="flex flex-col gap-1.5">
      <Link
        href={backHref}
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
        <span className="truncate text-xs">Terug naar dashboard</span>
      </Link>
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="truncate text-sm font-medium text-foreground">{propertyTitle}</span>
        {saveStatus !== "idle" && (
          <div className="flex items-center gap-1 text-[10px] shrink-0">
            <StatusIcon className={`h-3 w-3 ${statusConfig.className}`} />
            <span className={statusConfig.className}>{statusConfig.label}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-dvh w-full dark">
      <Editor
        projectId={`horecagrond-${propertyId}`}
        onLoad={handleLoad}
        onSave={handleSave}
        onSaveStatusChange={handleSaveStatusChange}
        sidebarTop={sidebarTop}
      />
      {/* Register AI commands in the editor's command palette */}
      <AiCommandsProvider />
    </div>
  );
}

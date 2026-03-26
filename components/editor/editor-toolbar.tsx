"use client";

import {
  MousePointer2,
  Square,
  PenTool,
  Armchair,
  Ruler,
  Move,
  Undo2,
  Redo2,
  Grid3X3,
  Save,
  Box,
  Layers2,
  Download,
  DoorOpen,
  AppWindow,
  Hammer,
  Sofa,
  RectangleHorizontal,
  SquareDashed,
  ArrowUp,
  ArrowDown,
  Scissors,
  List,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useEditorStore, useSceneStore } from "@/lib/editor/stores";
import type { EditorTool, EditorPhase, ViewMode, WallMode } from "@/lib/editor/stores";
import { cn } from "@/lib/utils";
import { captureCanvasAsPng, downloadDataUrl } from "@/lib/editor/utils";
import { toast } from "sonner";
import { AiGenerateDialog } from "@/components/editor/ai-generate-dialog";
import { AiScanDialog } from "@/components/editor/ai-scan-dialog";
import { TemplateDialog } from "@/components/editor/template-dialog";

interface EditorToolbarProps {
  onSave: () => void;
  readOnly?: boolean;
}

const TOOL_CONFIG: Array<{
  value: EditorTool;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Which phases this tool is available in (undefined = all) */
  phases?: EditorPhase[];
}> = [
  { value: "select", label: "Selecteren", icon: MousePointer2 },
  { value: "wall", label: "Muur tekenen", icon: Square, phases: ["structure"] },
  { value: "zone", label: "Zone tekenen", icon: PenTool, phases: ["structure"] },
  { value: "door", label: "Deur plaatsen", icon: DoorOpen, phases: ["structure"] },
  { value: "window", label: "Raam plaatsen", icon: AppWindow, phases: ["structure"] },
  { value: "slab", label: "Vloer tekenen", icon: RectangleHorizontal, phases: ["structure"] },
  { value: "ceiling", label: "Plafond tekenen", icon: SquareDashed, phases: ["structure"] },
  { value: "item", label: "Inventaris plaatsen", icon: Armchair, phases: ["furnish"] },
  { value: "measure", label: "Opmeten", icon: Ruler },
  { value: "pan", label: "Verplaatsen", icon: Move },
];

export function EditorToolbar({ onSave, readOnly }: EditorToolbarProps) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const phase = useEditorStore((s) => s.phase);
  const setPhase = useEditorStore((s) => s.setPhase);
  const wallMode = useEditorStore((s) => s.wallMode);
  const setWallMode = useEditorStore((s) => s.setWallMode);
  const sceneSidebarOpen = useEditorStore((s) => s.sceneSidebarOpen);
  const toggleSceneSidebar = useEditorStore((s) => s.toggleSceneSidebar);

  // Filter tools based on current phase
  const filteredTools = useMemo(
    () =>
      TOOL_CONFIG.filter(
        (tool) => !tool.phases || tool.phases.includes(phase),
      ),
    [phase],
  );

  const handleUndo = () => {
    useSceneStore.temporal.getState().undo();
  };

  const handleRedo = () => {
    useSceneStore.temporal.getState().redo();
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-2 py-1.5">
      {/* Tool selection */}
      <ToggleGroup
        type="single"
        value={activeTool}
        onValueChange={(value) => {
          if (value) setTool(value as EditorTool);
        }}
        variant="outline"
        size="sm"
        disabled={readOnly}
      >
        {filteredTools.map((tool) => (
          <Tooltip key={tool.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={tool.value}
                aria-label={tool.label}
              >
                <tool.icon className="size-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tool.label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-6" />

      {/* Phase toggle */}
      <ToggleGroup
        type="single"
        value={phase}
        onValueChange={(value) => {
          if (value) setPhase(value as EditorPhase);
        }}
        variant="outline"
        size="sm"
        disabled={readOnly}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="structure" aria-label="Structuur fase">
              <Hammer className="size-4" />
              <span className="text-xs">Structuur</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Structuur: muren, zones, deuren, ramen (1)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="furnish" aria-label="Inrichting fase">
              <Sofa className="size-4" />
              <span className="text-xs">Inrichting</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Inrichting: meubels en inventaris (2)
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <Separator orientation="vertical" className="h-6" />

      {/* View mode toggle */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (value) setViewMode(value as ViewMode);
        }}
        variant="outline"
        size="sm"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="2d" aria-label="2D weergave">
              <Layers2 className="size-4" />
              <span className="text-xs">2D</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">2D weergave</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="3d" aria-label="3D weergave">
              <Box className="size-4" />
              <span className="text-xs">3D</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">3D weergave</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      {/* Grid toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            variant="outline"
            size="sm"
            pressed={gridVisible}
            onPressedChange={toggleGrid}
            aria-label="Raster aan/uit"
          >
            <Grid3X3 className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Raster aan/uit</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Undo / Redo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleUndo}
            disabled={readOnly}
            aria-label="Ongedaan maken"
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Ongedaan maken</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleRedo}
            disabled={readOnly}
            aria-label="Opnieuw uitvoeren"
          >
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Opnieuw uitvoeren</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Wall mode toggle */}
      <ToggleGroup
        type="single"
        value={wallMode}
        onValueChange={(value) => {
          if (value) setWallMode(value as WallMode);
        }}
        variant="outline"
        size="sm"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="up" aria-label="Muren zichtbaar">
              <ArrowUp className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">Muren zichtbaar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="cutaway" aria-label="Muren doorsnede">
              <Scissors className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">Muren doorsnede</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="down" aria-label="Muren verbergen">
              <ArrowDown className="size-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">Muren verbergen</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      {/* Scene sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            variant="outline"
            size="sm"
            pressed={sceneSidebarOpen}
            onPressedChange={toggleSceneSidebar}
            aria-label="Scene overzicht"
          >
            <List className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Scene overzicht</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* AI tools & Templates */}
      <div className="flex items-center gap-1">
        <TemplateDialog disabled={readOnly} />
        <AiGenerateDialog disabled={readOnly} />
        <AiScanDialog disabled={readOnly} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export as PNG */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              const canvas = document.querySelector("canvas");
              if (canvas) {
                const png = captureCanvasAsPng(canvas);
                downloadDataUrl(png, "plattegrond.png");
                toast.success("Plattegrond geexporteerd als PNG");
              }
            }}
            disabled={readOnly}
            aria-label="Exporteer als PNG"
          >
            <Download className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Exporteer als PNG</TooltipContent>
      </Tooltip>

      {/* Save */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={readOnly}
            className={cn("gap-1.5")}
          >
            <Save className="size-4" />
            <span>Opslaan</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Plattegrond opslaan</TooltipContent>
      </Tooltip>
    </div>
  );
}

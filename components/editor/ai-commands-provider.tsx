"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  useCommandRegistry,
  usePaletteViewRegistry,
  useCommandPalette,
  applySceneGraphToEditor,
  useEditor,
} from "@pascal-app/editor";
import type { PaletteViewProps } from "@pascal-app/editor";
import { useScene } from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { generateAiFloorPlan } from "@/app/actions/ai-floor-plan";
import { scanFloorPlanImage } from "@/app/actions/ai-floor-plan-vision";
import type { SceneData } from "@/lib/editor/schema";
import { toast } from "sonner";
import {
  Sparkles,
  Camera,
  Loader2,
  Check,
  X,
  Upload,
  Building2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared state for AI generation flow
// ---------------------------------------------------------------------------

type AiState =
  | { phase: "idle" }
  | { phase: "generating"; label: string }
  | { phase: "review"; sceneData: SceneData; summary: string };

let _aiState: AiState = { phase: "idle" };
let _aiStateListeners = new Set<() => void>();

function setAiState(next: AiState) {
  _aiState = next;
  _aiStateListeners.forEach((fn) => fn());
}

function useAiState(): AiState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    _aiStateListeners.add(listener);
    return () => { _aiStateListeners.delete(listener); };
  }, []);
  return _aiState;
}

// ---------------------------------------------------------------------------
// Palette Page View: Generate Floor Plan Form
// ---------------------------------------------------------------------------

const PROPERTY_TYPES = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Cafe" },
  { value: "BAR", label: "Bar" },
  { value: "EETCAFE", label: "Eetcafe" },
  { value: "LUNCHROOM", label: "Lunchroom" },
  { value: "KOFFIEBAR", label: "Koffiebar" },
  { value: "PIZZERIA", label: "Pizzeria" },
  { value: "BAKERY", label: "Bakkerij" },
  { value: "GRAND_CAFE", label: "Grand Cafe" },
  { value: "COCKTAILBAR", label: "Cocktailbar" },
  { value: "SNACKBAR", label: "Snackbar" },
  { value: "HOTEL", label: "Hotel" },
];

function AiGenerateForm({ onClose }: PaletteViewProps) {
  const { setMode } = useCommandPalette();
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] = useState("RESTAURANT");
  const [surface, setSurface] = useState(120);
  const [seating, setSeating] = useState<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the textarea on mount
  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) {
      toast.error("Beschrijf je gewenste ruimte");
      return;
    }

    setMode("ai-progress");
    setAiState({ phase: "generating", label: "Plattegrond genereren..." });

    const result = await generateAiFloorPlan({
      description: description.trim(),
      propertyType,
      surfaceTotal: surface,
      seatingCapacityInside: seating,
    });

    if (!result.success || !result.data) {
      setAiState({ phase: "idle" });
      setMode("command");
      toast.error(result.error ?? "Generatie mislukt");
      onClose();
      return;
    }

    const zones = Object.values(result.data.nodes).filter(
      (n: any) => n.type === "zone"
    );
    const items = Object.values(result.data.nodes).filter(
      (n: any) => n.type === "item"
    );
    const summary = `${zones.length} zones, ${items.length} items, ${surface}m\u00B2`;

    setAiState({ phase: "review", sceneData: result.data, summary });
    setMode("ai-review");
  }, [description, propertyType, surface, seating, setMode, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Genereer plattegrond
      </div>

      {/* Primary input: natural language description */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          Beschrijf je ideale ruimte
        </span>
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          maxLength={2000}
          placeholder="bijv. Een modern restaurant met 80 zitplaatsen, open keuken, gezellig bargedeelte met 10 hoge krukken, en een overdekt terras voor 30 personen"
          className="resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs leading-relaxed placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-right text-[10px] text-muted-foreground/50">
          {description.length}/2000 &middot; Cmd+Enter om te genereren
        </span>
      </label>

      {/* Secondary inputs */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Type</span>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            Oppervlakte (m\u00B2)
          </span>
          <input
            type="number"
            value={surface}
            onChange={(e) => setSurface(Number(e.target.value))}
            min={10}
            max={10000}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            Zitplaatsen
          </span>
          <input
            type="number"
            value={seating ?? ""}
            onChange={(e) =>
              setSeating(e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder="optioneel"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs placeholder:text-muted-foreground/40"
          />
        </label>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!description.trim()}
        className="flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Genereer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette Page View: Scan Floor Plan from Photo
// ---------------------------------------------------------------------------

function AiScanForm({ onClose }: PaletteViewProps) {
  const { setMode } = useCommandPalette();
  const [surface, setSurface] = useState<number | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Alleen afbeeldingen worden ondersteund");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Afbeelding te groot (max 10 MB)");
        return;
      }

      setMode("ai-progress");
      setAiState({ phase: "generating", label: "Plattegrond analyseren..." });

      // Convert to data URL for the vision model
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const result = await scanFloorPlanImage({
        imageUrl: dataUrl,
        surfaceTotal: surface,
      });

      if (!result.success || !result.data) {
        setAiState({ phase: "idle" });
        setMode("command");
        toast.error(result.error ?? "Scan mislukt");
        onClose();
        return;
      }

      const zones = Object.values(result.data.nodes).filter(
        (n: any) => n.type === "zone"
      );
      const items = Object.values(result.data.nodes).filter(
        (n: any) => n.type === "item"
      );
      const summary = `${zones.length} zones, ${items.length} items gedetecteerd`;

      setAiState({ phase: "review", sceneData: result.data, summary });
      setMode("ai-review");
    },
    [surface, setMode, onClose]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Camera className="h-4 w-4 text-primary" />
        Scan plattegrond van foto
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          Oppervlakte hint (optioneel, verbetert nauwkeurigheid)
        </span>
        <input
          type="number"
          value={surface ?? ""}
          onChange={(e) =>
            setSurface(e.target.value ? Number(e.target.value) : undefined)
          }
          placeholder="bijv. 150"
          min={10}
          max={10000}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        />
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Sleep een foto hierheen of klik om te uploaden
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          PNG, JPG tot 10 MB
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode View: Generating Progress
// ---------------------------------------------------------------------------

function AiProgressView({ onClose }: PaletteViewProps) {
  const state = useAiState();
  const label =
    state.phase === "generating" ? state.label : "Even geduld...";

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Dit kan enkele seconden duren
        </p>
      </div>
      <button
        onClick={() => {
          setAiState({ phase: "idle" });
          onClose();
        }}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Annuleren
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode View: Review Generated Plan
// ---------------------------------------------------------------------------

function AiReviewView({ onClose }: PaletteViewProps) {
  const state = useAiState();

  if (state.phase !== "review") {
    onClose();
    return null;
  }

  const { sceneData, summary } = state;

  const handleAccept = () => {
    applySceneGraphToEditor({
      nodes: sceneData.nodes as Record<string, unknown>,
      rootNodeIds: sceneData.rootNodeIds as string[],
    });

    // Force level selection — applySceneGraphToEditor may not auto-select
    // the level if the nodes don't exactly match Pascal's expected format.
    requestAnimationFrame(() => {
      const nodes = useScene.getState().nodes;
      const allNodes = Object.values(nodes) as any[];
      const site = allNodes.find((n) => n.type === "site");
      const building = allNodes.find((n) => n.type === "building");
      const level = allNodes.find((n) => n.type === "level");

      if (building && level) {
        useViewer.getState().setSelection({
          buildingId: building.id,
          levelId: level.id,
          selectedIds: [],
          zoneId: null,
        });
        useEditor.getState().setPhase("structure");
        useEditor.getState().setStructureLayer("elements");
      }
    });

    setAiState({ phase: "idle" });
    toast.success("Plattegrond geladen in editor");
    onClose();
  };

  const handleReject = () => {
    setAiState({ phase: "idle" });
    onClose();
  };

  // Count node types for summary
  const allNodes = Object.values(sceneData.nodes) as any[];
  const walls = allNodes.filter((n) => n.type === "wall").length;
  const doors = allNodes.filter((n) => n.type === "door").length;
  const windows = allNodes.filter((n) => n.type === "window").length;
  const zones = allNodes.filter((n) => n.type === "zone");
  const items = allNodes.filter((n) => n.type === "item").length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Plattegrond gegenereerd
          </p>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-5 gap-2">
        <div className="rounded-md border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{walls}</p>
          <p className="text-[10px] text-muted-foreground">Muren</p>
        </div>
        <div className="rounded-md border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{doors}</p>
          <p className="text-[10px] text-muted-foreground">Deuren</p>
        </div>
        <div className="rounded-md border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{windows}</p>
          <p className="text-[10px] text-muted-foreground">Ramen</p>
        </div>
        <div className="rounded-md border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">
            {zones.length}
          </p>
          <p className="text-[10px] text-muted-foreground">Zones</p>
        </div>
        <div className="rounded-md border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{items}</p>
          <p className="text-[10px] text-muted-foreground">Items</p>
        </div>
      </div>

      {/* Zone list */}
      {zones.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zones.map((z: any) => (
            <span
              key={z.id}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {z.name ?? z.metadata?.zoneType?.replace(/_/g, " ") ?? z.zoneType?.replace(/_/g, " ") ?? "zone"}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          Laden in editor
        </button>
        <button
          onClick={handleReject}
          className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Verwerpen
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Dit vervangt de huidige scene. Gebruik Ctrl+Z om ongedaan te maken.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Provider — registers commands + views in the editor
// ---------------------------------------------------------------------------

export function AiCommandsProvider() {
  const register = useCommandRegistry((s) => s.register);
  const registerView = usePaletteViewRegistry((s) => s.register);
  const { navigateTo, setOpen } = useCommandPalette();

  useEffect(() => {
    // Register AI commands
    const unsubCommands = register([
      {
        id: "ai.generate-floor-plan",
        label: "Genereer plattegrond",
        group: "AI",
        icon: <Sparkles className="h-4 w-4" />,
        keywords: ["ai", "generate", "genereer", "plattegrond", "floor", "plan"],
        navigate: true,
        execute: () => {
          navigateTo("ai-generate");
        },
      },
      {
        id: "ai.scan-floor-plan",
        label: "Scan plattegrond van foto",
        group: "AI",
        icon: <Camera className="h-4 w-4" />,
        keywords: ["ai", "scan", "foto", "photo", "upload", "image", "vision"],
        navigate: true,
        execute: () => {
          navigateTo("ai-scan");
        },
      },
    ]);

    // Register page views (forms)
    const unsubGenerateView = registerView({
      key: "ai-generate",
      type: "page",
      label: "AI Genereer",
      Component: AiGenerateForm,
    });

    const unsubScanView = registerView({
      key: "ai-scan",
      type: "page",
      label: "AI Scan",
      Component: AiScanForm,
    });

    // Register mode views (full-screen states)
    const unsubProgressView = registerView({
      key: "ai-progress",
      type: "mode",
      Component: AiProgressView,
    });

    const unsubReviewView = registerView({
      key: "ai-review",
      type: "mode",
      Component: AiReviewView,
    });

    return () => {
      unsubCommands();
      unsubGenerateView();
      unsubScanView();
      unsubProgressView();
      unsubReviewView();
    };
  }, [register, registerView, navigateTo, setOpen]);

  return null;
}

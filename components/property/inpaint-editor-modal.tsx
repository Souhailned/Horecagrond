"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Undo2,
  Redo2,
  Eraser,
  Wand2,
  Loader2,
  Minus,
  Plus,
  Paintbrush,
  Trash2,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InpaintCanvas } from "@/components/property/inpaint-canvas";
import type { InpaintCanvasRef } from "@/components/property/inpaint-canvas";
import { BeforeAfterSlider } from "@/components/property/before-after-slider";
import { createInpaintPlaceholder } from "@/app/actions/ai-inpaint";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface InpaintEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceImageUrl: string;
  propertyTitle: string;
  propertyId?: string;
  sourceConceptId?: string;
  sourceImageId?: string;
  aiQuota?: { freeEditsUsed: number; freeEditsLimit: number };
  onSuccess?: (resultUrl: string) => void;
}

type EditorMode = "remove" | "add";

interface SSEProgress {
  step: string;
  pct: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function InpaintEditorModal({
  open,
  onOpenChange,
  sourceImageUrl,
  propertyTitle,
  propertyId,
  sourceConceptId,
  sourceImageId,
  aiQuota,
  onSuccess,
}: InpaintEditorModalProps) {
  const canvasRef = useRef<InpaintCanvasRef>(null);
  const [mode, setMode] = useState<EditorMode>("remove");
  const [brushSize, setBrushSize] = useState(30);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<SSEProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<
    Array<{ id: string; url: string }>
  >([]);

  const remaining =
    aiQuota ? aiQuota.freeEditsLimit - aiQuota.freeEditsUsed : -1;
  const isLimitReached = remaining === 0;

  /* -- Reset state when modal opens ---------------------------------------- */
  useEffect(() => {
    if (open) {
      setError(null);
      setResultUrl(null);
      setProgress(null);
      setIsGenerating(false);
    }
  }, [open]);

  /* -- Generate handler ---------------------------------------------------- */
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    if (mode === "remove" && !canvasRef.current?.hasMask()) {
      setError("Markeer eerst het gebied dat je wilt verwijderen");
      return;
    }
    if (mode === "add" && !prompt.trim()) {
      setError("Beschrijf wat je wilt toevoegen");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultUrl(null);

    try {
      const placeholderResult = await createInpaintPlaceholder({
        sourceConceptId,
        sourceImageId,
        sourceImageUrl,
        propertyId,
        prompt:
          prompt.trim() || "Remove the marked area and fill naturally",
        mode,
      });

      if (!placeholderResult.success || !placeholderResult.data) {
        setError(placeholderResult.success ? "Kon inpaint niet starten" : placeholderResult.error);
        setIsGenerating(false);
        return;
      }

      const { newImageId, sourceImageId: resolvedSourceId } =
        placeholderResult.data;

      const maskDataUrl =
        mode === "remove" ? canvasRef.current?.exportMask() : undefined;

      const response = await fetch("/api/ai/images/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: resolvedSourceId,
          newImageId,
          prompt:
            prompt.trim() || "Remove the marked area and fill naturally",
          mode,
          maskDataUrl: maskDataUrl || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        setError("Verbinding met server mislukt");
        setIsGenerating(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const dataMatch = line.match(/^data:\s*(.*)/);
          if (!dataMatch) continue;

          try {
            const event = JSON.parse(dataMatch[1]);

            if (event.type === "progress") {
              setProgress({ step: event.step, pct: event.pct });
            } else if (event.type === "done") {
              setResultUrl(event.resultImageUrl);
              setVersions((prev) => [
                ...prev,
                { id: event.imageId, url: event.resultImageUrl },
              ]);
              onSuccess?.(event.resultImageUrl);
            } else if (event.type === "error") {
              setError(event.message);
            }
          } catch {
            // Ignore parse errors from incomplete SSE chunks
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Er ging iets mis"
      );
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [
    mode,
    prompt,
    sourceConceptId,
    sourceImageId,
    sourceImageUrl,
    propertyId,
    isGenerating,
    onSuccess,
  ]);

  /* -- Progress label ------------------------------------------------------ */
  const progressLabel = progress
    ? progress.step === "uploading"
      ? "Afbeelding uploaden..."
      : progress.step === "generating"
        ? "AI genereert..."
        : "Opslaan..."
    : "Bezig...";

  /* -- Render -------------------------------------------------------------- */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/95" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Accessibility — visually hidden title */}
          <DialogTitle className="sr-only">
            AI Bewerker — {propertyTitle}
          </DialogTitle>

          {/* ============================================================== */}
          {/*  HEADER TOOLBAR                                                */}
          {/* ============================================================== */}
          <div className="flex items-center justify-between border-b border-white/10 bg-black/50 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              {/* Title */}
              <h2 className="text-sm font-semibold text-white">
                Edit Image
              </h2>

              {/* Mode toggle — pill group */}
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
                <button
                  onClick={() => setMode("remove")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20",
                    mode === "remove" && "bg-red-500/30"
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Verwijderen
                </button>
                <button
                  onClick={() => setMode("add")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20",
                    mode === "add" && "bg-green-500/30"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Toevoegen
                </button>
              </div>

              {/* Brush size slider */}
              <div className="flex items-center gap-2">
                <Paintbrush className="h-3.5 w-3.5 text-white/50" />
                <span className="text-xs text-white/50">Grootte:</span>
                <Slider
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  min={10}
                  max={100}
                  step={5}
                  className="w-28 [&_[data-slot=slider-range]]:bg-white/40 [&_[data-slot=slider-thumb]]:border-white/60 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-white/20"
                />
                <span className="w-8 text-xs tabular-nums text-white/50">
                  {brushSize}
                </span>
              </div>

              {/* Undo / Clear */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => canvasRef.current?.undo()}
                  disabled={isGenerating || !!resultUrl}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                  title="Ongedaan maken"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </button>
                <button
                  onClick={() => canvasRef.current?.redo()}
                  disabled={isGenerating || !!resultUrl}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                  title="Opnieuw"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => canvasRef.current?.clearMask()}
                  disabled={isGenerating || !!resultUrl}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                  title="Alles wissen"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Wissen
                </button>
              </div>
            </div>

            {/* Right: Quota + Close */}
            <div className="flex items-center gap-3">
              {remaining >= 0 && (
                <span className="text-xs tabular-nums text-white/50">
                  {remaining} bewerkingen over
                </span>
              )}
              <button
                onClick={() => onOpenChange(false)}
                disabled={isGenerating}
                className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ============================================================== */}
          {/*  CANVAS AREA                                                   */}
          {/* ============================================================== */}
          <div className="relative flex-1 overflow-hidden">
            {resultUrl ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="w-full max-w-4xl">
                  <BeforeAfterSlider
                    originalUrl={sourceImageUrl}
                    resultUrl={resultUrl}
                    beforeLabel="Origineel"
                    afterLabel="Bewerkt"
                  />
                </div>
              </div>
            ) : (
              <InpaintCanvas
                ref={canvasRef}
                sourceImageUrl={sourceImageUrl}
                brushSize={brushSize}
                className="h-full w-full"
              />
            )}

            {/* Processing overlay — dark with blur */}
            {isGenerating && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="text-center text-white">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />
                  <p className="text-sm font-medium">{progressLabel}</p>
                  <p className="mt-1 text-xs text-white/50">
                    Dit kan 20-30 seconden duren
                  </p>
                  {progress && (
                    <div className="mx-auto mt-3 h-1 w-48 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white/60 transition-all duration-300"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/*  VERSION HISTORY STRIP                                         */}
          {/* ============================================================== */}
          {versions.length > 0 && (
            <div className="flex items-center gap-2 border-t border-white/10 bg-black/50 px-4 py-2 backdrop-blur-sm">
              <span className="text-xs text-white/40">Versies:</span>
              <div className="flex gap-1.5 overflow-x-auto">
                {versions.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setResultUrl(v.url)}
                    className={cn(
                      "relative h-10 w-16 flex-shrink-0 overflow-hidden rounded border-2 transition-colors",
                      resultUrl === v.url
                        ? "border-white/60"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    <img
                      src={v.url}
                      alt={`Versie ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[8px] text-white/80">
                      v{i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/*  FOOTER CONTROLS                                               */}
          {/* ============================================================== */}
          <div className="border-t border-white/10 bg-black/50 px-4 py-3 backdrop-blur-sm">
            {/* Error display */}
            {error && (
              <p className="mb-2 text-center text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="mx-auto flex max-w-2xl items-center gap-3">
              {resultUrl ? (
                /* Post-result: Edit again */
                <>
                  <p className="flex-1 text-sm text-white/50">
                    Tevreden met het resultaat? Sluit de editor of bewerk opnieuw.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResultUrl(null);
                      setError(null);
                    }}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    Opnieuw bewerken
                  </Button>
                </>
              ) : (
                /* Active editing: Prompt + Execute */
                <>
                  <Input
                    placeholder={
                      mode === "remove"
                        ? "Beschrijf wat je verwijdert (bijv. 'de lamp op tafel')..."
                        : "Beschrijf wat je wilt toevoegen (bijv. 'een moderne vloerlamp')..."
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="flex-1 border-white/10 bg-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || isLimitReached}
                    className={cn(
                      "min-w-[120px] gap-2 text-white",
                      mode === "remove"
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-green-500 hover:bg-green-600"
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                    {mode === "remove" ? "Verwijderen" : "Toevoegen"}
                  </Button>
                </>
              )}
            </div>

            {/* Helper text */}
            {!resultUrl && (
              <p className="mt-2 text-center text-xs text-white/30">
                {mode === "remove"
                  ? "Teken over het object dat je wilt verwijderen"
                  : "Teken over het gebied waar je iets wilt toevoegen"}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

"use client";

import {
  useState,
  useTransition,
  useCallback,
  useRef,
  type DragEvent,
} from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { scanFloorPlanImage } from "@/app/actions/ai-floor-plan-vision";
import { useSceneStore } from "@/lib/editor/stores";
import { cn } from "@/lib/utils";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function AiScanDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [surfaceTotal, setSurfaceTotal] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setImageDataUrl(null);
    setFileName(null);
    setSurfaceTotal("");
    setIsDragging(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Ongeldig bestandstype. Gebruik PNG, JPEG of WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Bestand is te groot. Maximaal 10 MB.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
      setFileName(file.name);
    } catch {
      toast.error("Kon het bestand niet lezen.");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleRemoveImage = () => {
    setImageDataUrl(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (!imageDataUrl) {
      toast.error("Upload eerst een afbeelding van de plattegrond.");
      return;
    }

    const surface = surfaceTotal ? Number(surfaceTotal) : undefined;
    if (surface !== undefined && (surface < 10 || surface > 10000)) {
      toast.error("Voer een geldige oppervlakte in (10-10.000 m\u00B2).");
      return;
    }

    startTransition(async () => {
      const result = await scanFloorPlanImage({
        imageUrl: imageDataUrl,
        surfaceTotal: surface,
      });

      if (result.success && result.data) {
        useSceneStore.getState().loadScene(result.data);
        toast.success("Plattegrond gescand en geladen!");
        setOpen(false);
        resetForm();
      } else {
        toast.error(
          result.error ?? "Kon de plattegrond niet herkennen."
        );
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) resetForm();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="gap-1.5"
            >
              <Camera className="size-4" />
              <span className="hidden sm:inline">Scan Plattegrond</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Scan een foto van een plattegrond
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            Plattegrond Scannen
          </DialogTitle>
          <DialogDescription>
            Upload een foto van een plattegrond en laat AI de ruimtes en
            inrichting herkennen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* File upload area */}
          {imageDataUrl ? (
            <div className="relative">
              <div className="overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="Geupload plattegrond"
                  className="h-48 w-full object-contain bg-muted"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="truncate text-sm text-muted-foreground">
                  {fileName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveImage}
                  disabled={isPending}
                  className="shrink-0"
                >
                  <X className="mr-1 size-3" />
                  Verwijderen
                </Button>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Sleep een afbeelding hierheen
              </p>
              <p className="text-xs text-muted-foreground">
                of klik om te selecteren (PNG, JPEG, WebP, max 10 MB)
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload plattegrond afbeelding"
          />

          {/* Optional surface area */}
          <div className="grid gap-2">
            <Label htmlFor="scan-surface">
              Oppervlakte in m\u00B2 (optioneel)
            </Label>
            <Input
              id="scan-surface"
              type="number"
              min={10}
              max={10000}
              value={surfaceTotal}
              onChange={(e) => setSurfaceTotal(e.target.value)}
              placeholder="bijv. 120"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Helpt AI om nauwkeurigere afmetingen te schatten.
            </p>
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
          <Button
            onClick={handleSubmit}
            disabled={isPending || !imageDataUrl}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Scannen...
              </>
            ) : (
              <>
                <Camera className="mr-2 size-4" />
                Scannen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

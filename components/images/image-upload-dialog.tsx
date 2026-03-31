"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, Image as ImageIcon, CircleNotch } from "@phosphor-icons/react/dist/ssr"
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createSignedUploadUrls,
  recordUploadedImages,
} from "@/app/actions/images";

interface ImageUploadDialogProps {
  projectId: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

interface FilePreview {
  file: File;
  preview: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

export function ImageUploadDialog({
  projectId,
  trigger,
  onSuccess,
}: ImageUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [overallProgress, setOverallProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    if (files.length + validFiles.length > 10) {
      toast.error("Maximum 10 images per project");
      return;
    }

    const newPreviews = validFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: false,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newPreviews]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const input = fileInputRef.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      droppedFiles.forEach((file) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
      handleFileSelect({ target: input } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setOverallProgress(0);

    try {
      // Step 1: Get signed upload URLs
      const urlsResult = await createSignedUploadUrls(
        projectId,
        files.map((f) => ({ name: f.file.name, type: f.file.type }))
      );

      if (!urlsResult.success || !urlsResult.data) {
        throw new Error(urlsResult.success ? "Failed to get upload URLs" : urlsResult.error);
      }

      // Step 2: Upload each file directly to R2
      const uploadedImages: {
        imageId: string;
        path: string;
        originalFileName: string;
        contentType: string;
      }[] = [];

      for (let i = 0; i < files.length; i++) {
        const filePreview = files[i];
        const uploadData = urlsResult.data[i];

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, uploading: true, progress: 0 } : f
          )
        );

        try {
          // Upload to signed URL
          const response = await fetch(uploadData.signedUrl, {
            method: "PUT",
            body: filePreview.file,
            headers: {
              "Content-Type": filePreview.file.type,
            },
          });

          if (!response.ok) {
            throw new Error(`Upload failed for ${filePreview.file.name}`);
          }

          uploadedImages.push({
            imageId: uploadData.imageId,
            path: uploadData.path,
            originalFileName: filePreview.file.name,
            contentType: filePreview.file.type,
          });

          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, uploading: false, progress: 100 } : f
            )
          );
        } catch (error) {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    uploading: false,
                    error:
                      error instanceof Error ? error.message : "Upload failed",
                  }
                : f
            )
          );
        }

        setOverallProgress(((i + 1) / files.length) * 100);
      }

      // Step 3: Record uploaded images in database
      if (uploadedImages.length > 0) {
        const recordResult = await recordUploadedImages(projectId, uploadedImages);

        if (recordResult.success) {
          toast.success(`${uploadedImages.length} image(s) uploaded successfully`);
          setOpen(false);
          setFiles([]);
          router.refresh();
          onSuccess?.();
        } else {
          throw new Error(recordResult.error || "Failed to record images");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  // Cleanup previews on unmount
  React.useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.preview));
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Images
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload Images</DialogTitle>
          <DialogDescription>
            Upload up to 10 images for AI enhancement (max 10MB each)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
              "hover:border-primary hover:bg-muted/50",
              files.length > 0 && "min-h-[100px]"
            )}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="text-muted-foreground mb-2 h-10 w-10" />
            <p className="text-muted-foreground text-sm">
              Drag & drop images or click to browse
            </p>
            <p className="text-muted-foreground text-xs">
              {files.length}/10 images selected
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Preview grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {files.map((filePreview, index) => (
                <div
                  key={index}
                  className="group relative aspect-square overflow-hidden rounded-lg border"
                >
                  <img
                    src={filePreview.preview}
                    alt={filePreview.file.name}
                    className="h-full w-full object-cover"
                  />
                  {filePreview.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <CircleNotch className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                  {filePreview.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/80">
                      <span className="text-xs text-white">Error</span>
                    </div>
                  )}
                  {!isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={overallProgress} />
              <p className="text-muted-foreground text-center text-sm">
                Uploading... {Math.round(overallProgress)}%
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {files.length} Image{files.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

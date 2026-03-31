"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardHeader } from "@/components/dashboard/content-card";
import { ImageUploadDialog } from "@/components/images/image-upload-dialog";
import { ImageCard } from "@/components/images/image-card";
import { ImageComparison } from "@/components/images/image-comparison";
import { ImageMaskEditor } from "@/components/images/image-mask-editor";
import { ImageVersionsDialog } from "@/components/images/image-versions-dialog";
import { getImageProject } from "@/app/actions/image-projects";
import {
  deleteProjectImage,
  getImageVersions,
  getProjectImages,
  retryImageProcessing,
  startProjectProcessing,
  updateImageRoomType,
} from "@/app/actions/images";
import type { Image, ImageProject, ProjectStatus } from "@/generated/prisma/client";
import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  Clock,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useImageProcessing, getStepLabel } from "@/hooks/use-image-processing";

const statusConfig: Record<
  ProjectStatus,
  { label: string; icon: React.ReactNode; color: string }
> = {
  PENDING: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" />,
    color: "bg-yellow-500/20 text-yellow-600",
  },
  PROCESSING: {
    label: "Processing",
    icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    color: "bg-blue-500/20 text-blue-600",
  },
  COMPLETED: {
    label: "Completed",
    icon: <CheckCircle className="h-3 w-3" />,
    color: "bg-green-500/20 text-green-600",
  },
  FAILED: {
    label: "Failed",
    icon: <WarningCircle className="h-3 w-3" />,
    color: "bg-red-500/20 text-red-600",
  },
};

interface ProjectDetailPageClientProps {
  projectId: string;
  initialProject: ImageProject;
  initialImages: Image[];
}

export function ProjectDetailPageClient({
  projectId,
  initialProject,
  initialImages,
}: ProjectDetailPageClientProps) {
  const [project, setProject] = React.useState<ImageProject>(initialProject);
  const [images, setImages] = React.useState<Image[]>(initialImages);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date>(new Date());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [deleteImageState, setDeleteImageState] = React.useState<Image | null>(null);
  const [compareImage, setCompareImage] = React.useState<Image | null>(null);
  const [editingImage, setEditingImage] = React.useState<Image | null>(null);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [versions, setVersions] = React.useState<Image[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [projectResult, imagesResult] = await Promise.all([
        getImageProject(projectId),
        getProjectImages(projectId),
      ]);

      if (projectResult.success && projectResult.data) {
        const { images, ...projectOnly } = projectResult.data;
        void images;
        setProject(projectOnly as ImageProject);
      }

      if (imagesResult.success && imagesResult.data) {
        setImages(imagesResult.data);
      }

      setLastRefreshedAt(new Date());
    } catch (error) {
      console.error("Failed to refresh project data:", error);
      toast.error("Failed to refresh project data");
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId]);

  const pendingImages = React.useMemo(
    () => images.filter((img) => img.status === "PENDING" && !img.parentId),
    [images]
  );
  const processingImages = React.useMemo(
    () => images.filter((img) => img.status === "PROCESSING"),
    [images]
  );

  const processingImageIds = React.useMemo(
    () => processingImages.map((img) => img.id),
    [processingImages]
  );

  const { progressMap } = useImageProcessing(processingImageIds);

  const hasProcessing = processingImages.length > 0;
  const hasPending = pendingImages.length > 0;

  React.useEffect(() => {
    if (!hasProcessing && !hasPending) return;
    const pollInterval = hasProcessing ? 2000 : 10000;
    const interval = setInterval(() => void loadData(), pollInterval);
    return () => clearInterval(interval);
  }, [hasProcessing, hasPending, loadData]);
  const completedImages = React.useMemo(
    () => images.filter((img) => img.status === "COMPLETED"),
    [images]
  );
  const failedImages = React.useMemo(
    () => images.filter((img) => img.status === "FAILED"),
    [images]
  );

  const allPendingHaveRoomTypes = pendingImages.every((img) => {
    const metadata = img.metadata as { roomType?: string } | null;
    return !!metadata?.roomType;
  });

  const handleStartProcessing = async () => {
    setIsProcessing(true);
    try {
      const result = await startProjectProcessing(projectId);
      if (result.success) {
        toast.success(`Processing started for ${result.data?.processedCount} image(s)`);
        await loadData();
      } else {
        toast.error(result.error || "Failed to start processing");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenVersions = async (image: Image) => {
    const result = await getImageVersions(image.id);
    if (!result.success || !result.data) {
      toast.error(result.success ? "Failed to load versions" : result.error);
      return;
    }

    setVersions(result.data);
    setSelectedVersionId(image.id);
    setVersionsOpen(true);
  };

  const status = statusConfig[project.status];

  return (
    <ContentCard>
      <ContentCardHeader
        title={project.name}
        actions={
          <div className="flex items-center gap-2">
            <Badge className={cn("gap-1", status.color)}>
              {status.icon}
              {status.label}
            </Badge>
            <ImageUploadDialog projectId={projectId} onSuccess={() => void loadData()} />
          </div>
        }
      />

      <ContentCardBody className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/images">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to projects
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Last refresh: {lastRefreshedAt.toLocaleTimeString()}
            </span>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isRefreshing}>
              {isRefreshing && <CircleNotch className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Refresh
            </Button>
          </div>
        </div>

        {pendingImages.length > 0 && (
          <div className="mb-6 rounded-lg border p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Pending Images</h2>
                <p className="text-sm text-muted-foreground">
                  Assign room types and start processing.
                </p>
              </div>
              <Button
                onClick={handleStartProcessing}
                disabled={!allPendingHaveRoomTypes || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkle className="mr-2 h-4 w-4" />
                    Start Processing
                  </>
                )}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pendingImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onRoomTypeChange={(roomType) =>
                    void updateImageRoomType(image.id, roomType).then(() => void loadData())
                  }
                  onDelete={() => setDeleteImageState(image)}
                />
              ))}
            </div>
          </div>
        )}

        {processingImages.length > 0 && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
            <h2 className="mb-4 font-semibold">Processing ({processingImages.length})</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {processingImages.map((image) => {
                const progress = progressMap.get(image.id);
                return (
                  <ImageCard
                    key={image.id}
                    image={image}
                    processingProgress={
                      progress
                        ? { step: getStepLabel(progress.step), pct: progress.pct }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {failedImages.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-900/20">
            <h2 className="mb-4 font-semibold">Failed ({failedImages.length})</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {failedImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onRetry={() => void retryImageProcessing(image.id).then(() => void loadData())}
                  onDelete={() => setDeleteImageState(image)}
                  onEdit={() => setEditingImage(image)}
                  onVersions={() => void handleOpenVersions(image)}
                />
              ))}
            </div>
          </div>
        )}

        {completedImages.length > 0 && (
          <div className="rounded-lg border p-4">
            <h2 className="mb-4 font-semibold">Completed ({completedImages.length})</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {completedImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onCompare={() => setCompareImage(image)}
                  onDelete={() => setDeleteImageState(image)}
                  onEdit={() => setEditingImage(image)}
                  onVersions={() => void handleOpenVersions(image)}
                />
              ))}
            </div>
          </div>
        )}

        {images.length === 0 && (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed">
            <p className="mb-4 text-muted-foreground">No images yet</p>
            <ImageUploadDialog projectId={projectId} onSuccess={() => void loadData()} />
          </div>
        )}

        <AlertDialog open={!!deleteImageState} onOpenChange={() => setDeleteImageState(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Image?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The image and versions will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!deleteImageState) return;
                  void deleteProjectImage(deleteImageState.id).then(() => void loadData());
                  setDeleteImageState(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {compareImage?.resultImageUrl && (
          <ImageComparison
            originalUrl={compareImage.originalImageUrl}
            resultUrl={compareImage.resultImageUrl}
            open={true}
            onOpenChange={() => setCompareImage(null)}
          />
        )}

        <ImageMaskEditor
          open={!!editingImage}
          image={editingImage}
          onOpenChange={(open) => {
            if (!open) setEditingImage(null);
          }}
          onSuccess={() => void loadData()}
        />

        <ImageVersionsDialog
          open={versionsOpen}
          versions={versions}
          selectedId={selectedVersionId}
          onOpenChange={setVersionsOpen}
          onSelect={(img) => {
            setSelectedVersionId(img.id);
            if (img.resultImageUrl) {
              setCompareImage(img);
            }
          }}
        />
      </ContentCardBody>
    </ContentCard>
  );
}

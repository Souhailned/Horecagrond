"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import type { Image, ImageStatus, Prisma } from "@/generated/prisma/client";
import {
  createSignedUploadUrl,
  getPublicUrl,
  getExtensionFromContentType,
  generateImagePath,
  deleteImage as deleteStorageImage,
} from "@/lib/storage";
import { recomputeImageProjectCounters } from "@/lib/image-project-state";
import {
  generatePrompt,
  type StyleTemplateId,
  type RoomTypeId,
} from "@/lib/prompts";

export type EditMode = "remove" | "add";

// Get current user's active workspace
async function getActiveWorkspace() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return null;
  }

  // Try session's activeWorkspaceId first
  const sessionData = session.session as { activeWorkspaceId?: string } | undefined;
  if (sessionData?.activeWorkspaceId) {
    return {
      userId: session.user.id,
      workspaceId: sessionData.activeWorkspaceId,
    };
  }

  // Fallback: get user's first workspace membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) {
    return null;
  }

  return {
    userId: session.user.id,
    workspaceId: membership.workspaceId,
  };
}

function extractStoragePath(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// Create signed upload URLs for direct client upload
export async function createSignedUploadUrls(
  projectId: string,
  files: { name: string; type: string }[]
): Promise<
  ActionResult<
    {
      signedUrl: string;
      token: string;
      path: string;
      imageId: string;
    }[]
  >
> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Verify project belongs to workspace
    const project = await prisma.imageProject.findFirst({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        _count: {
          select: { images: { where: { parentId: null } } },
        },
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Check 10-image limit
    const currentCount = project._count.images;
    if (currentCount + files.length > 10) {
      return {
        success: false,
        error: `Cannot upload ${files.length} images. Project has ${currentCount}/10 images.`,
      };
    }

    const results = await Promise.all(
      files.map(async (file) => {
        const imageId = crypto.randomUUID();
        const extension = getExtensionFromContentType(file.type);
        const path = generateImagePath(
          context.workspaceId,
          projectId,
          imageId,
          "original",
          extension
        );

        const signedData = await createSignedUploadUrl(path);
        if (!signedData) {
          throw new Error("Failed to create signed URL");
        }

        return {
          ...signedData,
          imageId,
        };
      })
    );

    return { success: true, data: results };
  } catch (error) {
    console.error("[createSignedUploadUrls] Error:", error);
    return { success: false, error: "Failed to create upload URLs" };
  }
}

// Record uploaded images in database
export async function recordUploadedImages(
  projectId: string,
  images: {
    imageId: string;
    path: string;
    originalFileName: string;
    contentType: string;
    roomType?: string;
  }[]
): Promise<ActionResult<{ recordedCount: number }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const project = await prisma.imageProject.findFirst({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const imageRecords = images.map((img) => {
      const roomType = img.roomType || project.roomType;
      const prompt = generatePrompt(
        project.styleTemplateId as StyleTemplateId,
        roomType as RoomTypeId | undefined
      );

      return {
        id: img.imageId,
        workspaceId: context.workspaceId,
        userId: context.userId,
        projectId,
        originalImageUrl: getPublicUrl(img.path),
        prompt,
        status: "PENDING" as ImageStatus,
        metadata: {
          templateId: project.styleTemplateId,
          roomType: roomType || null,
          originalFileName: img.originalFileName,
          contentType: img.contentType,
        },
      };
    });

    await prisma.image.createMany({
      data: imageRecords,
    });

    const firstImage = imageRecords[0];
    if (!project.thumbnailUrl && firstImage?.originalImageUrl) {
      await prisma.imageProject.update({
        where: { id: projectId },
        data: {
          thumbnailUrl: firstImage.originalImageUrl,
        },
      });
    }

    await recomputeImageProjectCounters(projectId);

    revalidatePath(`/dashboard/images/${projectId}`);
    revalidatePath("/dashboard/images");
    return { success: true, data: { recordedCount: images.length } };
  } catch (error) {
    console.error("[recordUploadedImages] Error:", error);
    return { success: false, error: "Failed to record images" };
  }
}

// Get all images for a project
export async function getProjectImages(
  projectId: string
): Promise<ActionResult<Image[]>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const images = await prisma.image.findMany({
      where: {
        projectId,
        workspaceId: context.workspaceId,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return { success: true, data: images };
  } catch (error) {
    console.error("[getProjectImages] Error:", error);
    return { success: false, error: "Failed to fetch images" };
  }
}

export async function getImageVersions(
  imageId: string
): Promise<ActionResult<Image[]>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const image = await prisma.image.findFirst({
      where: {
        id: imageId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        parentId: true,
        projectId: true,
      },
    });

    if (!image) {
      return { success: false, error: "Image not found" };
    }

    const rootId = image.parentId || image.id;

    const versions = await prisma.image.findMany({
      where: {
        projectId: image.projectId,
        workspaceId: context.workspaceId,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      orderBy: [{ version: "asc" }],
    });

    return { success: true, data: versions };
  } catch (error) {
    console.error("[getImageVersions] Error:", error);
    return { success: false, error: "Failed to load versions" };
  }
}

// Update image room type
export async function updateImageRoomType(
  imageId: string,
  roomType: string
): Promise<ActionResult<Image>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const image = await prisma.image.findFirst({
      where: {
        id: imageId,
        workspaceId: context.workspaceId,
      },
      include: {
        project: {
          select: { styleTemplateId: true },
        },
      },
    });

    if (!image) {
      return { success: false, error: "Image not found" };
    }

    const newPrompt = generatePrompt(
      image.project.styleTemplateId as StyleTemplateId,
      roomType as RoomTypeId
    );

    const updatedImage = await prisma.image.update({
      where: { id: imageId },
      data: {
        prompt: newPrompt,
        metadata: {
          ...(image.metadata as object),
          roomType,
        },
      },
    });

    revalidatePath(`/dashboard/images/${image.projectId}`);
    return { success: true, data: updatedImage };
  } catch (error) {
    console.error("[updateImageRoomType] Error:", error);
    return { success: false, error: "Failed to update room type" };
  }
}

// Bulk update room types
export async function bulkUpdateImageRoomTypes(
  imageIds: string[],
  roomType: string
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const images = await prisma.image.findMany({
      where: {
        id: { in: imageIds },
        workspaceId: context.workspaceId,
      },
      include: {
        project: {
          select: { id: true, styleTemplateId: true },
        },
      },
    });

    await Promise.all(
      images.map(async (image) => {
        const newPrompt = generatePrompt(
          image.project.styleTemplateId as StyleTemplateId,
          roomType as RoomTypeId
        );

        await prisma.image.update({
          where: { id: image.id },
          data: {
            prompt: newPrompt,
            metadata: {
              ...(image.metadata as object),
              roomType,
            },
          },
        });
      })
    );

    const projectIds = [...new Set(images.map((img) => img.project.id))];
    projectIds.forEach((id) => revalidatePath(`/dashboard/images/${id}`));

    return { success: true, data: { updatedCount: images.length } };
  } catch (error) {
    console.error("[bulkUpdateImageRoomTypes] Error:", error);
    return { success: false, error: "Failed to update room types" };
  }
}

// Fire-and-forget helper to trigger the image processing API route
async function fireProcessImage(imageId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cookieHeader = (await headers()).get("cookie") ?? "";

  fetch(`${baseUrl}/api/ai/images/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ imageId }),
  }).catch((err: unknown) => {
    console.error("[fireProcessImage] Fire-and-forget error:", err);
  });
}

// Start processing for a project
export async function startProjectProcessing(
  projectId: string
): Promise<ActionResult<{ processedCount: number }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const pendingImages = await prisma.image.findMany({
      where: {
        projectId,
        workspaceId: context.workspaceId,
        status: "PENDING",
        parentId: null,
      },
    });

    if (pendingImages.length === 0) {
      return { success: true, data: { processedCount: 0 } };
    }

    const imagesWithoutRoomType = pendingImages.filter((img) => {
      const metadata = img.metadata as { roomType?: string } | null;
      return !metadata?.roomType;
    });

    if (imagesWithoutRoomType.length > 0) {
      return {
        success: false,
        error: `${imagesWithoutRoomType.length} image(s) need room types assigned`,
      };
    }

    let processedCount = 0;

    for (const image of pendingImages) {
      const claimed = await prisma.image.updateMany({
        where: {
          id: image.id,
          status: "PENDING",
        },
        data: {
          status: "PROCESSING",
          metadata: {
            ...(image.metadata as object),
            queuedAt: new Date().toISOString(),
          },
        },
      });

      if (claimed.count === 0) {
        continue;
      }

      // Fire-and-forget: trigger the SSE processing route
      await fireProcessImage(image.id);

      await prisma.image.update({
        where: { id: image.id },
        data: {
          metadata: {
            ...(image.metadata as object),
            startedAt: new Date().toISOString(),
            model: "fal-ai/nano-banana-pro",
          },
        },
      });

      processedCount += 1;
    }

    await recomputeImageProjectCounters(projectId);

    revalidatePath(`/dashboard/images/${projectId}`);
    revalidatePath("/dashboard/images");

    return { success: true, data: { processedCount } };
  } catch (error) {
    console.error("[startProjectProcessing] Error:", error);
    return { success: false, error: "Failed to start processing" };
  }
}

// Retry failed image
export async function retryImageProcessing(
  imageId: string
): Promise<ActionResult> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const image = await prisma.image.findFirst({
      where: {
        id: imageId,
        workspaceId: context.workspaceId,
        status: "FAILED",
      },
    });

    if (!image) {
      return { success: false, error: "Image not found or not in failed state" };
    }

    const claimed = await prisma.image.updateMany({
      where: {
        id: imageId,
        status: "FAILED",
      },
      data: {
        status: "PROCESSING",
        errorMessage: null,
      },
    });

    if (claimed.count === 0) {
      return { success: false, error: "Image already being retried" };
    }

    // Fire-and-forget: trigger the SSE processing route
    await fireProcessImage(imageId);

    await prisma.image.update({
      where: { id: imageId },
      data: {
        metadata: {
          ...(image.metadata as object),
          startedAt: new Date().toISOString(),
          model: "fal-ai/nano-banana-pro",
        },
      },
    });

    await recomputeImageProjectCounters(image.projectId);

    revalidatePath(`/dashboard/images/${image.projectId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[retryImageProcessing] Error:", error);
    return { success: false, error: "Failed to retry processing" };
  }
}

// Trigger inpaint task and create new image version
export async function triggerInpaintTask(
  imageId: string,
  prompt: string,
  mode: EditMode,
  maskDataUrl?: string
): Promise<ActionResult<{ runId: string; newImageId: string }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const image = await prisma.image.findFirst({
      where: {
        id: imageId,
        workspaceId: context.workspaceId,
      },
    });

    if (!image) {
      return { success: false, error: "Image not found" };
    }

    if (mode === "remove" && !maskDataUrl) {
      return { success: false, error: "Mask is required for remove mode" };
    }

    const rootId = image.parentId || image.id;

    const latestVersion = await prisma.image.findFirst({
      where: {
        projectId: image.projectId,
        workspaceId: context.workspaceId,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      orderBy: [{ version: "desc" }],
      select: {
        version: true,
      },
    });

    const nextVersion = (latestVersion?.version || image.version || 1) + 1;
    const sourceImageUrl = image.resultImageUrl || image.originalImageUrl;

    const placeholder = await prisma.image.create({
      data: {
        workspaceId: image.workspaceId,
        userId: image.userId,
        projectId: image.projectId,
        originalImageUrl: sourceImageUrl,
        resultImageUrl: null,
        prompt,
        version: nextVersion,
        parentId: rootId,
        status: "PROCESSING",
        errorMessage: null,
        metadata: {
          editedFrom: image.id,
          editMode: mode,
          queuedAt: new Date().toISOString(),
        },
      },
    });

    // Update metadata with run info before firing the API call
    await prisma.image.update({
      where: { id: placeholder.id },
      data: {
        metadata: {
          ...(placeholder.metadata as object),
          runId: "direct",
          startedAt: new Date().toISOString(),
          model:
            mode === "remove"
              ? "fal-ai/flux-pro/v1/fill"
              : "fal-ai/nano-banana-pro/edit",
        },
      },
    });

    // Fire-and-forget: call the SSE inpaint API route
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const cookieHeader = (await headers()).get("cookie") || "";

    fetch(`${baseUrl}/api/ai/images/inpaint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        imageId,
        newImageId: placeholder.id,
        prompt,
        mode,
        maskDataUrl,
      }),
    }).catch((err: unknown) =>
      console.error("[triggerInpaintTask] Fire-and-forget fetch error:", err)
    );

    revalidatePath(`/dashboard/images/${image.projectId}`);
    return {
      success: true,
      data: { runId: "direct", newImageId: placeholder.id },
    };
  } catch (error) {
    console.error("[triggerInpaintTask] Error:", error);
    return { success: false, error: "Failed to start image edit" };
  }
}

// Delete image
export async function deleteProjectImage(
  imageId: string
): Promise<ActionResult<void>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const image = await prisma.image.findFirst({
      where: {
        id: imageId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        originalImageUrl: true,
        resultImageUrl: true,
      },
    });

    if (!image) {
      return { success: false, error: "Image not found" };
    }

    const descendants = image.parentId
      ? []
      : await prisma.image.findMany({
          where: {
            parentId: image.id,
            workspaceId: context.workspaceId,
          },
          select: {
            id: true,
            originalImageUrl: true,
            resultImageUrl: true,
          },
        });

    const imagesToDelete = [image, ...descendants];

    for (const entry of imagesToDelete) {
      const originalPath = extractStoragePath(entry.originalImageUrl);
      if (originalPath) {
        await deleteStorageImage(originalPath);
      }

      if (entry.resultImageUrl) {
        const resultPath = extractStoragePath(entry.resultImageUrl);
        if (resultPath) {
          await deleteStorageImage(resultPath);
        }
      }
    }

    await prisma.image.deleteMany({
      where: image.parentId
        ? { id: image.id }
        : {
            OR: [{ id: image.id }, { parentId: image.id }],
          },
    });

    await recomputeImageProjectCounters(image.projectId);

    revalidatePath(`/dashboard/images/${image.projectId}`);
    revalidatePath("/dashboard/images");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[deleteProjectImage] Error:", error);
    return { success: false, error: "Failed to delete image" };
  }
}

// Update image (for API route callback)
export async function updateImage(
  imageId: string,
  data: Partial<{
    status: ImageStatus;
    resultImageUrl: string;
    errorMessage: string;
    metadata: Prisma.InputJsonValue;
  }>
): Promise<ActionResult<Image>> {
  try {
    const image = await prisma.image.update({
      where: { id: imageId },
      data: data as Prisma.ImageUpdateInput,
    });

    await recomputeImageProjectCounters(image.projectId);

    revalidatePath(`/dashboard/images/${image.projectId}`);
    revalidatePath("/dashboard/images");
    return { success: true, data: image };
  } catch (error) {
    console.error("[updateImage] Error:", error);
    return { success: false, error: "Failed to update image" };
  }
}

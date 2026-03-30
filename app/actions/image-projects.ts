"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import type { ImageProject, ProjectStatus } from "@/generated/prisma/client";

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

// Create a new image project
export async function createImageProject(data: {
  name: string;
  styleTemplateId?: string;
  roomType?: string;
  propertyId?: string;
}): Promise<ActionResult<ImageProject>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Verify workspace membership
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: context.userId, workspaceId: context.workspaceId },
    });
    if (!member) {
      return { success: false, error: "Not a workspace member" };
    }

    // If propertyId is provided, verify the property exists
    if (data.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
        select: { id: true },
      });
      if (!property) {
        return { success: false, error: "Property not found" };
      }
    }

    const project = await prisma.imageProject.create({
      data: {
        name: data.name,
        styleTemplateId: data.styleTemplateId || "modern",
        roomType: data.roomType,
        workspaceId: context.workspaceId,
        userId: context.userId,
        propertyId: data.propertyId || null,
      },
    });

    revalidatePath("/dashboard/images");
    return { success: true, data: project };
  } catch (error) {
    console.error("[createImageProject] Error:", error);
    return { success: false, error: "Failed to create project" };
  }
}

// Get all projects for the current workspace
export async function getImageProjects(): Promise<ActionResult<ImageProject[]>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const projects = await prisma.imageProject.findMany({
      where: {
        workspaceId: context.workspaceId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: projects };
  } catch (error) {
    console.error("[getImageProjects] Error:", error);
    return { success: false, error: "Failed to fetch projects" };
  }
}

// Get a single project by ID
export async function getImageProject(
  projectId: string
): Promise<ActionResult<ImageProject & { images: { id: string; status: string }[] }>> {
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
      include: {
        images: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    return { success: true, data: project };
  } catch (error) {
    console.error("[getImageProject] Error:", error);
    return { success: false, error: "Failed to fetch project" };
  }
}

// Update project
export async function updateImageProject(
  projectId: string,
  data: Partial<{
    name: string;
    styleTemplateId: string;
    roomType: string;
    status: ProjectStatus;
    thumbnailUrl: string;
    imageCount: number;
    completedCount: number;
  }>
): Promise<ActionResult<ImageProject>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const project = await prisma.imageProject.update({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
      data,
    });

    revalidatePath("/dashboard/images");
    revalidatePath(`/dashboard/images/${projectId}`);
    return { success: true, data: project };
  } catch (error) {
    console.error("[updateImageProject] Error:", error);
    return { success: false, error: "Failed to update project" };
  }
}

// Delete project
export async function deleteImageProject(
  projectId: string
): Promise<ActionResult<void>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Import deleteProjectImages dynamically to avoid circular deps
    const { deleteProjectImages } = await import("@/lib/storage");

    // Attempt storage cleanup first. We proceed with DB delete even on partial storage failure.
    const storageDeleted = await deleteProjectImages(context.workspaceId, projectId);
    if (!storageDeleted) {
      console.warn("[deleteImageProject] Storage cleanup partially failed", {
        workspaceId: context.workspaceId,
        projectId,
      });
    }

    // Delete project (cascades to images in DB)
    await prisma.imageProject.delete({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
    });

    revalidatePath("/dashboard/images");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[deleteImageProject] Error:", error);
    return { success: false, error: "Failed to delete project" };
  }
}

// Get all image projects linked to a specific property
export async function getImageProjectsForProperty(
  propertyId: string
): Promise<ActionResult<ImageProject[]>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Verify workspace membership
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: context.userId, workspaceId: context.workspaceId },
    });
    if (!member) {
      return { success: false, error: "Not a workspace member" };
    }

    const projects = await prisma.imageProject.findMany({
      where: {
        propertyId,
        workspaceId: context.workspaceId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: projects };
  } catch (error) {
    console.error("[getImageProjectsForProperty] Error:", error);
    return { success: false, error: "Failed to fetch image projects for property" };
  }
}

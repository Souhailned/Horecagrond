"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import type { VideoProject, Prisma } from "@/generated/prisma/client";

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

// Create a new video project
export async function createVideoProject(data: {
  clipCount?: number;
  aspectRatio?: string;
  generateNativeAudio?: boolean;
  musicVolume?: number;
  videoVolume?: number;
  propertyId?: string;
}): Promise<ActionResult<VideoProject>> {
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

    const project = await prisma.videoProject.create({
      data: {
        workspaceId: context.workspaceId,
        clipCount: data.clipCount || 0,
        aspectRatio: data.aspectRatio || "16:9",
        generateNativeAudio: data.generateNativeAudio || false,
        musicVolume: data.musicVolume || 0.3,
        videoVolume: data.videoVolume || 1.0,
        status: "pending",
        propertyId: data.propertyId || null,
      },
    });

    revalidatePath("/dashboard/videos");
    return { success: true, data: project };
  } catch (error) {
    console.error("[createVideoProject] Error:", error);
    return { success: false, error: "Failed to create project" };
  }
}

// Get all projects for the current workspace
export async function getVideoProjects(): Promise<ActionResult<VideoProject[]>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const projects = await prisma.videoProject.findMany({
      where: {
        workspaceId: context.workspaceId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: projects };
  } catch (error) {
    console.error("[getVideoProjects] Error:", error);
    return { success: false, error: "Failed to fetch projects" };
  }
}

// Get a single project by ID with clips
export async function getVideoProject(
  projectId: string
): Promise<ActionResult<VideoProject & { clips: { id: string; status: string; sequenceOrder: number }[] }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const project = await prisma.videoProject.findFirst({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
      include: {
        clips: {
          select: {
            id: true,
            status: true,
            sequenceOrder: true,
          },
          orderBy: {
            sequenceOrder: 'asc',
          },
        },
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    return { success: true, data: project };
  } catch (error) {
    console.error("[getVideoProject] Error:", error);
    return { success: false, error: "Failed to fetch project" };
  }
}

// Update project
export async function updateVideoProject(
  projectId: string,
  data: Prisma.VideoProjectUpdateInput
): Promise<ActionResult<VideoProject>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    const project = await prisma.videoProject.update({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
      data,
    });

    revalidatePath("/dashboard/videos");
    revalidatePath(`/dashboard/videos/${projectId}`);
    return { success: true, data: project };
  } catch (error) {
    console.error("[updateVideoProject] Error:", error);
    return { success: false, error: "Failed to update project" };
  }
}

// Delete project
export async function deleteVideoProject(
  projectId: string
): Promise<ActionResult<void>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Delete project (cascades to clips in DB)
    await prisma.videoProject.delete({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
    });

    revalidatePath("/dashboard/videos");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[deleteVideoProject] Error:", error);
    return { success: false, error: "Failed to delete project" };
  }
}

// Start video generation (call orchestrator API route)
export async function startVideoGeneration(
  projectId: string
): Promise<ActionResult<{ runId: string }>> {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return { success: false, error: "Not authenticated or no active workspace" };
    }

    // Verify project exists and belongs to workspace
    const project = await prisma.videoProject.findFirst({
      where: {
        id: projectId,
        workspaceId: context.workspaceId,
      },
      include: { clips: { select: { id: true } } },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    if (project.clips.length === 0) {
      return { success: false, error: "No clips in this project" };
    }

    // Don't allow re-triggering if already processing
    if (["generating", "compiling"].includes(project.status)) {
      return { success: false, error: "Generation is already in progress" };
    }

    // Update status to processing
    await prisma.videoProject.update({
      where: { id: projectId },
      data: { status: "processing", errorMessage: null },
    });

    // Call the orchestrator API route instead of Trigger.dev directly
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const headersList = await headers();
    const cookieHeader = headersList.get("cookie") || "";

    const response = await fetch(`${baseUrl}/api/ai/videos/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ videoProjectId: projectId }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || "Failed to start generation" };
    }

    const responseData = await response.json();

    revalidatePath(`/dashboard/videos/${projectId}`);
    revalidatePath("/dashboard/videos");

    return { success: true, data: { runId: responseData.runId || "direct" } };
  } catch (error) {
    console.error("[startVideoGeneration] Error:", error);
    return { success: false, error: "Failed to start video generation" };
  }
}

// Get all video projects linked to a specific property
export async function getVideoProjectsForProperty(
  propertyId: string
): Promise<ActionResult<VideoProject[]>> {
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

    const projects = await prisma.videoProject.findMany({
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
    console.error("[getVideoProjectsForProperty] Error:", error);
    return { success: false, error: "Failed to fetch video projects for property" };
  }
}

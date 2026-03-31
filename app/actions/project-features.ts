"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import { logActivity } from "@/app/actions/project-activity";
import {
  createProjectFeatureSchema,
  deleteProjectFeatureSchema,
  type CreateProjectFeatureInput,
  type DeleteProjectFeatureInput,
} from "@/lib/validations/project";

// ============================================
// HELPER FUNCTIONS
// ============================================

type SessionContextResult =
  | { success: true; data: { userId: string; workspaceId: string } }
  | { success: false; error: string };

async function getSessionContext(): Promise<SessionContextResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "No active session" };
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });

    if (!member) {
      return { success: false, error: "User has no workspace membership" };
    }

    return {
      success: true,
      data: {
        userId: session.user.id,
        workspaceId: member.workspace.id,
      },
    };
  } catch (error) {
    console.error("getSessionContext error:", error);
    return { success: false, error: "Session context error" };
  }
}

async function canModifyProject(
  userId: string,
  projectId: string
): Promise<{ allowed: boolean; isOwner: boolean }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      createdById: true,
      members: {
        where: { userId },
        select: { role: true, access: true },
      },
    },
  });

  if (!project) {
    return { allowed: false, isOwner: false };
  }

  const isCreator = project.createdById === userId;
  const membership = project.members[0];

  if (isCreator) {
    return { allowed: true, isOwner: true };
  }

  if (membership) {
    const canEdit =
      membership.access === "FULL_ACCESS" || membership.access === "CAN_EDIT";
    const isOwnerOrPIC =
      membership.role === "OWNER" || membership.role === "PIC";
    return { allowed: canEdit || isOwnerOrPIC, isOwner: isOwnerOrPIC };
  }

  return { allowed: false, isOwner: false };
}

// ============================================
// FEATURE CRUD
// ============================================

export async function createFeature(
  input: CreateProjectFeatureInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = createProjectFeatureSchema.parse(input);

    const { allowed } = await canModifyProject(
      ctx.userId,
      validatedData.projectId
    );
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Get max order for this priority within the project
    const maxOrderResult = await prisma.projectFeature.aggregate({
      where: {
        projectId: validatedData.projectId,
        priority: validatedData.priority,
      },
      _max: { order: true },
    });
    const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

    const feature = await prisma.projectFeature.create({
      data: {
        projectId: validatedData.projectId,
        priority: validatedData.priority,
        content: validatedData.content,
        order: nextOrder,
      },
    });

    void logActivity({
      projectId: validatedData.projectId,
      actorId: ctx.userId,
      action: "created",
      entity: "feature",
      entityName: validatedData.content,
      description: `added ${validatedData.priority} feature "${validatedData.content}"`,
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: feature.id } };
  } catch (error: unknown) {
    console.error("Error creating feature:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create feature" };
  }
}

export async function deleteFeature(
  input: DeleteProjectFeatureInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = deleteProjectFeatureSchema.parse(input);

    const feature = await prisma.projectFeature.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!feature) {
      return { success: false, error: "Feature not found" };
    }

    const { allowed } = await canModifyProject(ctx.userId, feature.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const featureRecord = await prisma.projectFeature.findUnique({
      where: { id: validatedData.id },
      select: { content: true, priority: true },
    });

    await prisma.projectFeature.delete({
      where: { id: validatedData.id },
    });

    void logActivity({
      projectId: feature.projectId,
      actorId: ctx.userId,
      action: "deleted",
      entity: "feature",
      entityName: featureRecord?.content ?? null,
      description: `removed ${featureRecord?.priority ?? ""} feature "${featureRecord?.content ?? "feature"}"`,
    });

    revalidatePath(`/dashboard/projects/${feature.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting feature:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to delete feature" };
  }
}

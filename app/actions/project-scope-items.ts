"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import { logActivity } from "@/app/actions/project-activity";
import {
  createProjectScopeItemSchema,
  deleteProjectScopeItemSchema,
  type CreateProjectScopeItemInput,
  type DeleteProjectScopeItemInput,
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
// SCOPE ITEM CRUD
// ============================================

export async function createScopeItem(
  input: CreateProjectScopeItemInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = createProjectScopeItemSchema.parse(input);

    const { allowed } = await canModifyProject(
      ctx.userId,
      validatedData.projectId
    );
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Get max order for this type within the project
    const maxOrderResult = await prisma.projectScopeItem.aggregate({
      where: {
        projectId: validatedData.projectId,
        type: validatedData.type,
      },
      _max: { order: true },
    });
    const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

    const item = await prisma.projectScopeItem.create({
      data: {
        projectId: validatedData.projectId,
        type: validatedData.type,
        content: validatedData.content,
        order: nextOrder,
      },
    });

    const typeLabel =
      validatedData.type === "IN_SCOPE" ? "In Scope" :
      validatedData.type === "OUT_OF_SCOPE" ? "Out of Scope" : "Expected Outcomes";
    void logActivity({
      projectId: validatedData.projectId,
      actorId: ctx.userId,
      action: "created",
      entity: "scope_item",
      entityName: validatedData.content,
      description: `added "${validatedData.content}" to ${typeLabel}`,
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: item.id } };
  } catch (error: unknown) {
    console.error("Error creating scope item:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create scope item" };
  }
}

export async function deleteScopeItem(
  input: DeleteProjectScopeItemInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = deleteProjectScopeItemSchema.parse(input);

    const item = await prisma.projectScopeItem.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!item) {
      return { success: false, error: "Scope item not found" };
    }

    const { allowed } = await canModifyProject(ctx.userId, item.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const scopeItem = await prisma.projectScopeItem.findUnique({
      where: { id: validatedData.id },
      select: { content: true, type: true, projectId: true },
    });

    await prisma.projectScopeItem.delete({
      where: { id: validatedData.id },
    });

    void logActivity({
      projectId: item.projectId,
      actorId: ctx.userId,
      action: "deleted",
      entity: "scope_item",
      entityName: scopeItem?.content ?? null,
      description: `removed "${scopeItem?.content ?? "item"}" from scope`,
    });

    revalidatePath(`/dashboard/projects/${item.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting scope item:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to delete scope item" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import {
  createProjectDeliverableSchema,
  updateProjectDeliverableSchema,
  deleteProjectDeliverableSchema,
  type CreateProjectDeliverableInput,
  type UpdateProjectDeliverableInput,
  type DeleteProjectDeliverableInput,
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
// DELIVERABLE CRUD
// ============================================

export async function createDeliverable(
  input: CreateProjectDeliverableInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = createProjectDeliverableSchema.parse(input);

    const { allowed } = await canModifyProject(
      ctx.userId,
      validatedData.projectId
    );
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Get max order for deliverables in this project
    const maxOrderResult = await prisma.projectDeliverable.aggregate({
      where: { projectId: validatedData.projectId },
      _max: { order: true },
    });
    const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

    const deliverable = await prisma.projectDeliverable.create({
      data: {
        projectId: validatedData.projectId,
        title: validatedData.title,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        order: nextOrder,
      },
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: deliverable.id } };
  } catch (error: unknown) {
    console.error("Error creating deliverable:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create deliverable" };
  }
}

export async function updateDeliverable(
  input: UpdateProjectDeliverableInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = updateProjectDeliverableSchema.parse(input);

    const deliverable = await prisma.projectDeliverable.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!deliverable) {
      return { success: false, error: "Deliverable not found" };
    }

    const { allowed } = await canModifyProject(
      ctx.userId,
      deliverable.projectId
    );
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Build update data, handling optional fields
    const updateData: Record<string, unknown> = {};
    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.completed !== undefined)
      updateData.completed = validatedData.completed;
    if (validatedData.order !== undefined) updateData.order = validatedData.order;
    if (validatedData.dueDate !== undefined) {
      updateData.dueDate =
        validatedData.dueDate && validatedData.dueDate !== ""
          ? new Date(validatedData.dueDate)
          : null;
    }

    await prisma.projectDeliverable.update({
      where: { id: validatedData.id },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${deliverable.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error updating deliverable:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to update deliverable" };
  }
}

export async function deleteDeliverable(
  input: DeleteProjectDeliverableInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = deleteProjectDeliverableSchema.parse(input);

    const deliverable = await prisma.projectDeliverable.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!deliverable) {
      return { success: false, error: "Deliverable not found" };
    }

    const { allowed } = await canModifyProject(
      ctx.userId,
      deliverable.projectId
    );
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    await prisma.projectDeliverable.delete({
      where: { id: validatedData.id },
    });

    revalidatePath(`/dashboard/projects/${deliverable.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting deliverable:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to delete deliverable" };
  }
}

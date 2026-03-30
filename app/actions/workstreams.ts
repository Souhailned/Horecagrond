"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import { logActivity } from "@/app/actions/project-activity";
import {
  createWorkstreamSchema,
  updateWorkstreamSchema,
  deleteWorkstreamSchema,
  reorderWorkstreamsSchema,
  moveTaskToWorkstreamSchema,
  type CreateWorkstreamInput,
  type UpdateWorkstreamInput,
  type DeleteWorkstreamInput,
  type ReorderWorkstreamsInput,
  type MoveTaskToWorkstreamInput,
} from "@/lib/validations/workstream";

// ============================================
// TYPES
// ============================================

export type WorkstreamTask = {
  id: string;
  name: string;
  status: string;
  assigneeId: string | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
  endDate: Date | null;
  order: number;
  workstreamId: string | null;
};

export type WorkstreamWithTasks = {
  id: string;
  name: string;
  order: number;
  tasks: WorkstreamTask[];
};

// ============================================
// HELPER FUNCTIONS
// ============================================

type SessionContextResult =
  | { success: true; data: { userId: string; workspaceId: string } }
  | { success: false; error: string };

/**
 * Get current user's session and active workspace
 */
async function getSessionContext(): Promise<SessionContextResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "No active session" };
    }

    // Get user's active workspace
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

/**
 * Check if user has permission to modify a project
 */
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

  // Creator always has access
  if (isCreator) {
    return { allowed: true, isOwner: true };
  }

  // Check member role
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
// WORKSTREAM CRUD OPERATIONS
// ============================================

/**
 * Create a new workstream in a project
 */
export async function createWorkstream(
  input: CreateWorkstreamInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = createWorkstreamSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Get max order from existing workstreams
    const maxOrderResult = await prisma.projectWorkstream.aggregate({
      where: { projectId: validatedData.projectId },
      _max: { order: true },
    });
    const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

    // Create workstream
    const workstream = await prisma.projectWorkstream.create({
      data: {
        projectId: validatedData.projectId,
        name: validatedData.name,
        order: nextOrder,
      },
    });

    void logActivity({
      projectId: validatedData.projectId,
      actorId: ctx.userId,
      action: "created",
      entity: "workstream",
      entityName: validatedData.name,
      description: `created workstream "${validatedData.name}"`,
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: workstream.id } };
  } catch (error: unknown) {
    console.error("Error creating workstream:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create workstream" };
  }
}

/**
 * Update a workstream name
 */
export async function updateWorkstream(
  input: UpdateWorkstreamInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = updateWorkstreamSchema.parse(input);

    // Look up workstream to get projectId
    const workstream = await prisma.projectWorkstream.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!workstream) {
      return { success: false, error: "Workstream not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, workstream.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Update name
    await prisma.projectWorkstream.update({
      where: { id: validatedData.id },
      data: { name: validatedData.name },
    });

    revalidatePath(`/dashboard/projects/${workstream.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error updating workstream:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to update workstream" };
  }
}

/**
 * Delete a workstream (orphan tasks by setting workstreamId to null)
 */
export async function deleteWorkstream(
  input: DeleteWorkstreamInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = deleteWorkstreamSchema.parse(input);

    // Look up workstream to get projectId
    const workstream = await prisma.projectWorkstream.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!workstream) {
      return { success: false, error: "Workstream not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, workstream.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Set all tasks in this workstream to workstreamId: null, then delete
    const wsRecord = await prisma.projectWorkstream.findUnique({
      where: { id: validatedData.id },
      select: { name: true },
    });

    await prisma.$transaction([
      prisma.projectTask.updateMany({
        where: { workstreamId: validatedData.id },
        data: { workstreamId: null },
      }),
      prisma.projectWorkstream.delete({
        where: { id: validatedData.id },
      }),
    ]);

    void logActivity({
      projectId: workstream.projectId,
      actorId: ctx.userId,
      action: "deleted",
      entity: "workstream",
      entityName: wsRecord?.name ?? null,
      description: `deleted workstream "${wsRecord?.name ?? "workstream"}"`,
    });

    revalidatePath(`/dashboard/projects/${workstream.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting workstream:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to delete workstream" };
  }
}

/**
 * Reorder workstreams within a project
 */
export async function reorderWorkstreams(
  input: ReorderWorkstreamsInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = reorderWorkstreamsSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Update order of each workstream in a transaction
    await prisma.$transaction(
      validatedData.orderedIds.map((id, index) =>
        prisma.projectWorkstream.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error reordering workstreams:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to reorder workstreams" };
  }
}

/**
 * Move a task to a different workstream (or remove from workstream)
 */
export async function moveTaskToWorkstream(
  input: MoveTaskToWorkstreamInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = moveTaskToWorkstreamSchema.parse(input);

    // Look up task to get projectId
    const task = await prisma.projectTask.findUnique({
      where: { id: validatedData.taskId },
      select: { projectId: true },
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, task.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Update task's workstreamId and order
    await prisma.projectTask.update({
      where: { id: validatedData.taskId },
      data: {
        workstreamId: validatedData.workstreamId,
        order: validatedData.order,
      },
    });

    revalidatePath(`/dashboard/projects/${task.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error moving task to workstream:", error);

    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to move task" };
  }
}

/**
 * List all workstreams for a project with their tasks
 */
export async function listWorkstreams(
  projectId: string
): Promise<ActionResult<WorkstreamWithTasks[]>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }

    // Fetch all workstreams for the project with tasks
    const workstreams = await prisma.projectWorkstream.findMany({
      where: { projectId },
      include: {
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    // Transform to response type
    const result: WorkstreamWithTasks[] = workstreams.map((ws) => ({
      id: ws.id,
      name: ws.name,
      order: ws.order,
      tasks: ws.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        assigneeId: t.assigneeId,
        assignee: t.assignee,
        endDate: t.endDate,
        order: t.order,
        workstreamId: t.workstreamId,
      })),
    }));

    return { success: true, data: result };
  } catch (error: unknown) {
    console.error("Error listing workstreams:", error);
    return { success: false, error: "Failed to load workstreams" };
  }
}

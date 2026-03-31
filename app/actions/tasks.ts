"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import type { TaskDetail, TaskGroup, ViewOptions } from "@/types/task";
import { DEFAULT_VIEW_OPTIONS } from "@/lib/view-options";
import {
  createMyTaskSchema,
  updateMyTaskSchema,
  deleteMyTaskSchema,
  toggleTaskStatusSchema,
  moveTaskDateSchema,
  reorderTasksSchema,
  listMyTasksSchema,
  type CreateMyTaskInput,
  type UpdateMyTaskInput,
  type DeleteMyTaskInput,
  type ToggleTaskStatusInput,
  type MoveTaskDateInput,
  type ReorderTasksInput,
  type ListMyTasksInput,
} from "@/lib/validations/task";

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
 * Check if user can modify a task (via project membership)
 */
async function canModifyTask(
  userId: string,
  taskId: string
): Promise<{ allowed: boolean; projectId: string | null }> {
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    select: {
      projectId: true,
      project: {
        select: {
          createdById: true,
          members: {
            where: { userId },
            select: { access: true },
          },
        },
      },
    },
  });

  if (!task) {
    return { allowed: false, projectId: null };
  }

  const isCreator = task.project.createdById === userId;
  const membership = task.project.members[0];

  if (isCreator) {
    return { allowed: true, projectId: task.projectId };
  }

  if (membership) {
    const canEdit =
      membership.access === "FULL_ACCESS" || membership.access === "CAN_EDIT";
    return { allowed: canEdit, projectId: task.projectId };
  }

  return { allowed: false, projectId: task.projectId };
}

// ============================================
// TASK OPERATIONS
// ============================================

/**
 * List all tasks assigned to the current user across their workspace
 */
export async function listMyTasks(
  input?: Partial<ListMyTasksInput>
): Promise<ActionResult<TaskGroup[]>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = listMyTasksSchema.parse(input || {});
    const filters = validatedData.filters || {};

    // Build where clause
    const where: any = {
      project: {
        workspaceId: ctx.workspaceId,
      },
      // Only show tasks assigned to current user (or unassigned for now)
      OR: [
        { assigneeId: ctx.userId },
        { assigneeId: null },
      ],
    };

    // Status filter
    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    } else if (!validatedData.includeCompleted) {
      where.status = { not: "DONE" };
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      where.priority = { in: filters.priority };
    }

    // Tag filter
    if (filters.tag && filters.tag.length > 0) {
      where.tag = { in: filters.tag };
    }

    // Assignee filter
    if (filters.assigneeId && filters.assigneeId.length > 0) {
      where.assigneeId = { in: filters.assigneeId };
    }

    // Project filter
    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.endDate = {};
      if (filters.dateFrom) {
        where.endDate.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.endDate.lte = new Date(filters.dateTo);
      }
    }

    // Fetch tasks with project and assignee
    const tasks = await prisma.projectTask.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: [{ endDate: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    });

    // Group tasks by project
    const groupMap = new Map<string, TaskGroup>();

    for (const task of tasks) {
      const projectId = task.projectId;

      if (!groupMap.has(projectId)) {
        groupMap.set(projectId, {
          project: {
            id: task.project.id,
            name: task.project.name,
            status: task.project.status,
            priority: task.project.priority,
          },
          tasks: [],
          stats: { total: 0, completed: 0 },
        });
      }

      const group = groupMap.get(projectId)!;
      group.tasks.push({
        id: task.id,
        projectId: task.projectId,
        project: {
          id: task.project.id,
          name: task.project.name,
          status: task.project.status,
          priority: task.project.priority,
        },
        name: task.name,
        description: task.description,
        status: task.status as any,
        priority: null as any,
        tag: null as any,
        startDate: task.startDate,
        endDate: task.endDate,
        order: task.order,
        assigneeId: task.assigneeId,
        assignee: task.assignee,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });

      group.stats.total++;
      if (task.status === "DONE") {
        group.stats.completed++;
      }
    }

    const groups = Array.from(groupMap.values());

    return { success: true, data: groups };
  } catch (error: any) {
    console.error("Error listing tasks:", error);
    return { success: false, error: "Failed to load tasks" };
  }
}

/**
 * Create a new task
 */
export async function createTask(
  input: CreateMyTaskInput
): Promise<ActionResult<TaskDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = createMyTaskSchema.parse(input);

    // Verify project belongs to user's workspace
    const project = await prisma.project.findFirst({
      where: {
        id: validatedData.projectId,
        workspaceId: ctx.workspaceId,
      },
      select: { id: true, name: true, status: true, priority: true },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: validatedData.projectId,
        name: validatedData.name,
        description: validatedData.description || null,
        assigneeId: validatedData.assigneeId || null,
        status: validatedData.status,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        order: validatedData.order,
      },
      include: {
        project: {
          select: { id: true, name: true, status: true, priority: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    const result: TaskDetail = {
      id: task.id,
      projectId: task.projectId,
      project: {
        id: task.project.id,
        name: task.project.name,
        status: task.project.status,
        priority: task.project.priority,
      },
      name: task.name,
      description: task.description,
      status: task.status as any,
      priority: null as any,
      tag: null as any,
      startDate: task.startDate,
      endDate: task.endDate,
      order: task.order,
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    revalidatePath("/dashboard/lifecycle");
    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating task:", error);
    console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: error.message || "Failed to create task" };
  }
}

/**
 * Update a task
 */
export async function updateTask(
  input: UpdateMyTaskInput
): Promise<ActionResult<TaskDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = updateMyTaskSchema.parse(input);

    // Check permission
    const { allowed, projectId } = await canModifyTask(ctx.userId, validatedData.id);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Build update data
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.assigneeId !== undefined) updateData.assigneeId = validatedData.assigneeId || null;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.priority !== undefined) updateData.priority = validatedData.priority || null;
    if (validatedData.tag !== undefined) updateData.tag = validatedData.tag || null;
    if (validatedData.startDate !== undefined) {
      updateData.startDate = validatedData.startDate ? new Date(validatedData.startDate) : null;
    }
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null;
    }
    if (validatedData.order !== undefined) updateData.order = validatedData.order;

    const task = await prisma.projectTask.update({
      where: { id: validatedData.id },
      data: updateData,
      include: {
        project: {
          select: { id: true, name: true, status: true, priority: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    const result: TaskDetail = {
      id: task.id,
      projectId: task.projectId,
      project: {
        id: task.project.id,
        name: task.project.name,
        status: task.project.status,
        priority: task.project.priority,
      },
      name: task.name,
      description: task.description,
      status: task.status as any,
      priority: null as any,
      tag: null as any,
      startDate: task.startDate,
      endDate: task.endDate,
      order: task.order,
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    revalidatePath("/dashboard/lifecycle");
    if (projectId) {
      revalidatePath(`/dashboard/projects/${projectId}`);
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error updating task:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to update task" };
  }
}

/**
 * Delete a task
 */
export async function deleteTask(
  input: DeleteMyTaskInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = deleteMyTaskSchema.parse(input);

    // Check permission
    const { allowed, projectId } = await canModifyTask(ctx.userId, validatedData.id);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    await prisma.projectTask.delete({
      where: { id: validatedData.id },
    });

    revalidatePath("/dashboard/lifecycle");
    if (projectId) {
      revalidatePath(`/dashboard/projects/${projectId}`);
    }

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error deleting task:", error);
    return { success: false, error: "Failed to delete task" };
  }
}

/**
 * Toggle task status between TODO and DONE
 */
export async function toggleTaskStatus(
  input: ToggleTaskStatusInput
): Promise<ActionResult<TaskDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = toggleTaskStatusSchema.parse(input);

    // Check permission
    const { allowed, projectId } = await canModifyTask(ctx.userId, validatedData.id);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const task = await prisma.projectTask.update({
      where: { id: validatedData.id },
      data: { status: validatedData.status },
      include: {
        project: {
          select: { id: true, name: true, status: true, priority: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    const result: TaskDetail = {
      id: task.id,
      projectId: task.projectId,
      project: {
        id: task.project.id,
        name: task.project.name,
        status: task.project.status,
        priority: task.project.priority,
      },
      name: task.name,
      description: task.description,
      status: task.status as any,
      priority: null as any,
      tag: null as any,
      startDate: task.startDate,
      endDate: task.endDate,
      order: task.order,
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    revalidatePath("/dashboard/lifecycle");
    if (projectId) {
      revalidatePath(`/dashboard/projects/${projectId}`);
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error toggling task status:", error);
    return { success: false, error: "Failed to update task status" };
  }
}

/**
 * Move a task to a different date
 */
export async function moveTaskDate(
  input: MoveTaskDateInput
): Promise<ActionResult<TaskDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = moveTaskDateSchema.parse(input);

    // Check permission
    const { allowed, projectId } = await canModifyTask(ctx.userId, validatedData.id);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const task = await prisma.projectTask.update({
      where: { id: validatedData.id },
      data: {
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      },
      include: {
        project: {
          select: { id: true, name: true, status: true, priority: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    const result: TaskDetail = {
      id: task.id,
      projectId: task.projectId,
      project: {
        id: task.project.id,
        name: task.project.name,
        status: task.project.status,
        priority: task.project.priority,
      },
      name: task.name,
      description: task.description,
      status: task.status as any,
      priority: null as any,
      tag: null as any,
      startDate: task.startDate,
      endDate: task.endDate,
      order: task.order,
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    revalidatePath("/dashboard/lifecycle");
    if (projectId) {
      revalidatePath(`/dashboard/projects/${projectId}`);
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error moving task date:", error);
    return { success: false, error: "Failed to move task" };
  }
}

/**
 * Batch reorder tasks (used for drag-drop)
 */
export async function reorderTasks(
  input: ReorderTasksInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }

    const validatedData = reorderTasksSchema.parse(input);

    // Update all tasks in a transaction
    await prisma.$transaction(
      validatedData.tasks.map((task) =>
        prisma.projectTask.update({
          where: { id: task.id },
          data: {
            order: task.order,
            endDate: task.endDate ? new Date(task.endDate) : undefined,
          },
        })
      )
    );

    revalidatePath("/dashboard/lifecycle");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error reordering tasks:", error);
    return { success: false, error: "Failed to reorder tasks" };
  }
}

/**
 * Get workspace members for assignee dropdown
 */
export async function getWorkspaceMembers(): Promise<
  ActionResult<Array<{ id: string; name: string | null; email: string; image: string | null }>>
> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return {
      success: true,
      data: members.map((m) => m.user),
    };
  } catch (error: any) {
    console.error("Error getting workspace members:", error);
    return { success: false, error: "Failed to load members" };
  }
}

/**
 * Get workspace projects for project dropdown
 */
export async function getWorkspaceProjects(): Promise<
  ActionResult<Array<{ id: string; name: string; status: string }>>
> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const projects = await prisma.project.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    });

    return { success: true, data: projects };
  } catch (error: any) {
    console.error("Error getting workspace projects:", error);
    return { success: false, error: "Failed to load projects" };
  }
}

// ============================================
// VIEW OPTIONS PERSISTENCE
// ============================================

/**
 * Get user's saved view options for the current workspace
 */
export async function getViewOptions(): Promise<ActionResult<ViewOptions>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // TODO: UserPreference model not yet implemented
    // For now, return default options
    return { success: true, data: DEFAULT_VIEW_OPTIONS };
  } catch (error: any) {
    console.error("Error getting view options:", error);
    return { success: true, data: DEFAULT_VIEW_OPTIONS };
  }
}

/**
 * Save user's view options for the current workspace
 */
export async function saveViewOptions(
  options: ViewOptions
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // TODO: UserPreference model not yet implemented
    // For now, just return success
    console.log("View options would be saved:", options);
    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error saving view options:", error);
    return { success: false, error: "Failed to save view options" };
  }
}

/**
 * Reset user's view options to defaults
 */
export async function resetViewOptions(): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // TODO: UserPreference model not yet implemented
    console.log("View options would be reset to defaults");
    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error resetting view options:", error);
    return { success: false, error: "Failed to reset view options" };
  }
}

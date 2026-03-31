"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import type {
  ProjectListItem,
  ProjectDetail,
  PaginatedProjects,
} from "@/types/project";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/app/actions/project-activity";
import {
  createProjectSchema,
  updateProjectSchema,
  deleteProjectSchema,
  getProjectSchema,
  listProjectsSchema,
  addProjectMemberSchema,
  removeProjectMemberSchema,
  createProjectTaskSchema,
  updateProjectTaskSchema,
  deleteProjectTaskSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type DeleteProjectInput,
  type ListProjectsInput,
  type AddProjectMemberInput,
  type RemoveProjectMemberInput,
  type CreateProjectTaskInput,
  type UpdateProjectTaskInput,
  type DeleteProjectTaskInput,
} from "@/lib/validations/project";

// ============================================
// HELPER FUNCTIONS
// ============================================

type SessionContextResult =
  | { success: true; data: { userId: string; workspaceId: string; workspaceRole: string } }
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

    // Get user's active workspace or first workspace
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
        workspaceRole: member.role,
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
// PROJECT CRUD OPERATIONS
// ============================================

// ============================================
// STARTER TASK TEMPLATES
// ============================================

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

async function createStarterTasks(
  tx: TxClient,
  projectId: string,
  structure: string
) {
  if (structure === "LINEAR") {
    const tasks = [
      "Define scope & requirements",
      "Design & planning",
      "Development & execution",
      "Review, test & launch",
    ];
    await tx.projectTask.createMany({
      data: tasks.map((name, i) => ({
        projectId,
        name,
        status: "TODO" as const,
        order: i,
      })),
    });
  } else if (structure === "MILESTONES" || structure === "MULTISTREAM") {
    const streams =
      structure === "MILESTONES"
        ? [
            {
              name: "Phase 1 — Discovery",
              tasks: ["Stakeholder alignment", "Requirements definition"],
            },
            {
              name: "Phase 2 — Execution",
              tasks: ["Core development", "Internal review"],
            },
            {
              name: "Phase 3 — Delivery",
              tasks: ["User acceptance testing", "Go-live & handover"],
            },
          ]
        : [
            {
              name: "Planning",
              tasks: ["Define scope", "Resource planning"],
            },
            {
              name: "Development",
              tasks: ["Core implementation", "Quality assurance"],
            },
            {
              name: "Communication",
              tasks: ["Stakeholder updates", "Documentation"],
            },
          ];

    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];
      const ws = await tx.projectWorkstream.create({
        data: { projectId, name: stream.name, order: i },
      });
      await tx.projectTask.createMany({
        data: stream.tasks.map((name, j) => ({
          projectId,
          workstreamId: ws.id,
          name,
          status: "TODO" as const,
          order: j,
        })),
      });
    }
  }
}

// ============================================
// PROJECT CRUD OPERATIONS (continued)
// ============================================

/**
 * Create a new project (with full wizard support)
 */
export async function createProject(
  input: CreateProjectInput
): Promise<ActionResult<ProjectDetail>> {
  try {
    // Auth + RBAC permission check
    const authCheck = await requirePermission("projects:create");
    if (!authCheck.success) {
      return { success: false, error: authCheck.error };
    }
    const { userId } = authCheck.data!;

    // Get workspace context
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
    });
    if (!membership) {
      return { success: false, error: "User has no workspace membership" };
    }
    const workspaceId = membership.workspaceId;

    // Validate input
    const validatedData = createProjectSchema.parse(input);

    const {
      wizardOwnerId,
      wizardMembers,
      wizardDeliverables,
      wizardMetrics,
      addStarterTasks,
      ...projectFields
    } = validatedData;

    // Determine owner: wizard-selected owner or session user
    const ownerId = wizardOwnerId || userId;

    // Run everything in a single transaction
    const project = await prisma.$transaction(async (tx) => {
      // 1. Create project — always add session user as creator member
      const creatorRole = ownerId === userId ? "OWNER" : "PIC";
      const newProject = await tx.project.create({
        data: {
          workspaceId,
          createdById: userId,
          name: projectFields.name,
          description: projectFields.description || null,
          status: projectFields.status,
          priority: projectFields.priority,
          startDate: projectFields.startDate
            ? new Date(projectFields.startDate)
            : null,
          endDate: projectFields.endDate
            ? new Date(projectFields.endDate)
            : null,
          estimate: projectFields.estimate || null,
          deadlineType: projectFields.deadlineType,
          intent: projectFields.intent || null,
          successType: projectFields.successType,
          structure: projectFields.structure || null,
          typeLabel: projectFields.typeLabel || null,
          groupLabel: projectFields.groupLabel || null,
          label: projectFields.label || null,
          clientName: projectFields.clientName || null,
          location: projectFields.location || null,
          sprints: projectFields.sprints || null,
          members: {
            create: {
              userId,
              role: creatorRole,
              access: "FULL_ACCESS",
            },
          },
        },
      });

      // 2. Add selected owner (if different from creator)
      if (ownerId !== userId) {
        await tx.projectMember.create({
          data: {
            projectId: newProject.id,
            userId: ownerId,
            role: "OWNER",
            access: "FULL_ACCESS",
          },
        });
      }

      // 3. Add contributors and stakeholders from wizard
      if (wizardMembers?.length) {
        const existingUserIds = new Set([userId, ownerId]);
        const uniqueMembers = wizardMembers.filter(
          (m) => !existingUserIds.has(m.userId)
        );
        if (uniqueMembers.length > 0) {
          await tx.projectMember.createMany({
            data: uniqueMembers.map((m) => ({
              projectId: newProject.id,
              userId: m.userId,
              role: m.role,
              access: m.access,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 4. Create deliverables
      if (wizardDeliverables?.length) {
        await tx.projectDeliverable.createMany({
          data: wizardDeliverables.map((d, i) => ({
            projectId: newProject.id,
            title: d.title,
            dueDate: d.dueDate ? new Date(d.dueDate) : null,
            order: i,
          })),
        });
      }

      // 5. Create metrics
      if (wizardMetrics?.length) {
        await tx.projectMetric.createMany({
          data: wizardMetrics.map((m) => ({
            projectId: newProject.id,
            name: m.name,
            target: m.target || null,
          })),
        });
      }

      // 6. Create starter tasks based on structure
      if (addStarterTasks && projectFields.structure) {
        await createStarterTasks(tx, newProject.id, projectFields.structure);
      }

      return newProject;
    });

    // Fetch full project for response
    const fullProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        workstreams: {
          include: {
            tasks: {
              include: {
                assignee: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
            },
          },
        },
        notes: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        deliverables: true,
        metrics: true,
        scopeItems: true,
        features: true,
        files: {
          include: {
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        tags: { include: { tag: true } },
      },
    });

    const result = {
      ...fullProject,
      tags: fullProject.tags.map((t) => t.tag),
      workstreams: fullProject.workstreams ?? [],
      notes: fullProject.notes ?? [],
    } as ProjectDetail;

    revalidatePath("/dashboard/projects");

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating project:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create project" };
  }
}

/**
 * Update a project
 */
export async function updateProject(
  input: UpdateProjectInput
): Promise<ActionResult<ProjectDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = updateProjectSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.id);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Build update data
    const updateData: any = {};

    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.priority !== undefined) updateData.priority = validatedData.priority;
    if (validatedData.progress !== undefined) updateData.progress = validatedData.progress;
    if (validatedData.startDate !== undefined) {
      updateData.startDate = validatedData.startDate ? new Date(validatedData.startDate) : null;
    }
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null;
    }
    if (validatedData.estimate !== undefined) updateData.estimate = validatedData.estimate || null;
    if (validatedData.deadlineType !== undefined) updateData.deadlineType = validatedData.deadlineType;
    if (validatedData.intent !== undefined) updateData.intent = validatedData.intent || null;
    if (validatedData.successType !== undefined) updateData.successType = validatedData.successType;
    if (validatedData.structure !== undefined) updateData.structure = validatedData.structure || null;
    if (validatedData.typeLabel !== undefined) updateData.typeLabel = validatedData.typeLabel || null;
    if (validatedData.groupLabel !== undefined) updateData.groupLabel = validatedData.groupLabel || null;
    if (validatedData.label !== undefined) updateData.label = validatedData.label || null;
    if (validatedData.clientName !== undefined) updateData.clientName = validatedData.clientName || null;
    if (validatedData.location !== undefined) updateData.location = validatedData.location || null;
    if (validatedData.sprints !== undefined) updateData.sprints = validatedData.sprints || null;

    const project = await prisma.project.update({
      where: { id: validatedData.id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        deliverables: true,
        metrics: true,
        scopeItems: true,
        features: true,
        files: {
          include: {
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        tags: {
          include: { tag: true },
        },
        workstreams: {
          include: {
            tasks: {
              include: {
                assignee: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
        notes: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const result = {
      ...project,
      tags: project.tags.map((t) => t.tag),
      workstreams: project.workstreams ?? [],
      notes: project.notes ?? [],
    } as ProjectDetail;

    void logActivity({
      projectId: validatedData.id,
      actorId: ctx.userId,
      action: "updated",
      entity: "project",
      entityName: validatedData.name ?? project.name,
      description: validatedData.name
        ? `renamed project to "${validatedData.name}"`
        : validatedData.status
        ? `updated status to ${validatedData.status.toLowerCase()}`
        : "updated project details",
    });

    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${validatedData.id}`);

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error updating project:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to update project" };
  }
}

/**
 * Delete a project
 */
export async function deleteProject(
  input: DeleteProjectInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = deleteProjectSchema.parse(input);

    // Check permission (only owner can delete)
    const { isOwner } = await canModifyProject(ctx.userId, validatedData.id);
    if (!isOwner) {
      return { success: false, error: "Only project owner can delete" };
    }

    await prisma.project.delete({
      where: { id: validatedData.id },
    });

    revalidatePath("/dashboard/projects");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error deleting project:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to delete project" };
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(
  id: string
): Promise<ActionResult<ProjectDetail>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate
    const validatedData = getProjectSchema.parse({ id });

    const project = await prisma.project.findFirst({
      where: {
        id: validatedData.id,
        workspaceId: ctx.workspaceId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { order: "asc" },
        },
        workstreams: {
          include: {
            tasks: {
              include: {
                assignee: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
        notes: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        deliverables: {
          orderBy: { order: "asc" },
        },
        metrics: {
          orderBy: { createdAt: "asc" },
        },
        scopeItems: {
          orderBy: [{ type: "asc" }, { order: "asc" }],
        },
        features: {
          orderBy: [{ priority: "asc" }, { order: "asc" }],
        },
        files: {
          include: {
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { uploadedAt: "desc" },
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const result = {
      ...project,
      tags: project.tags.map((t) => t.tag),
      workstreams: project.workstreams ?? [],
      notes: project.notes ?? [],
    } as ProjectDetail;

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error getting project:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to load project" };
  }
}

/**
 * List projects with pagination and filters
 */
export async function listProjects(
  input?: Partial<ListProjectsInput>
): Promise<ActionResult<PaginatedProjects>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate and apply defaults
    const validatedData = listProjectsSchema.parse(input || {});

    // Build where clause
    const where: any = {
      workspaceId: ctx.workspaceId,
    };

    // Status filter
    if (validatedData.status) {
      where.status = validatedData.status;
    } else if (!validatedData.includeCompleted) {
      where.status = { notIn: ["COMPLETED", "CANCELLED"] };
    }

    // Priority filter
    if (validatedData.priority) {
      where.priority = validatedData.priority;
    }

    // Search filter
    if (validatedData.search) {
      where.OR = [
        { name: { contains: validatedData.search, mode: "insensitive" } },
        { clientName: { contains: validatedData.search, mode: "insensitive" } },
        { description: { contains: validatedData.search, mode: "insensitive" } },
      ];
    }

    // Get total count
    const total = await prisma.project.count({ where });

    // Get paginated results
    const projects = await prisma.project.findMany({
      where,
      include: {
        _count: {
          select: { tasks: true, members: true },
        },
        tasks: {
          select: { status: true },
        },
        tags: {
          include: { tag: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          take: 5, // Limit for avatar display
          orderBy: { joinedAt: "asc" },
        },
      },
      orderBy: { [validatedData.sortBy]: validatedData.sortOrder },
      skip: (validatedData.page - 1) * validatedData.pageSize,
      take: validatedData.pageSize,
    });

    // Transform results
    const items: ProjectListItem[] = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      progress: p.progress,
      startDate: p.startDate,
      endDate: p.endDate,
      typeLabel: p.typeLabel,
      clientName: p.clientName,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      _count: p._count,
      taskStats: {
        total: p.tasks.length,
        completed: p.tasks.filter((t) => t.status === "DONE").length,
      },
      tags: p.tags.map((t) => t.tag),
      members: p.members.map((m) => ({
        id: m.id,
        role: m.role,
        user: m.user,
      })),
    }));

    const pageCount = Math.ceil(total / validatedData.pageSize);

    return {
      success: true,
      data: {
        items,
        total,
        page: validatedData.page,
        pageSize: validatedData.pageSize,
        pageCount,
      },
    };
  } catch (error: any) {
    console.error("Error listing projects:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    // Return more specific error message for debugging
    const errorMessage = error?.message || error?.code || "Unknown error";
    return { success: false, error: `Failed to load projects: ${errorMessage}` };
  }
}

// ============================================
// PROJECT TASK OPERATIONS
// ============================================

/**
 * Create a task in a project
 */
export async function createProjectTask(
  input: CreateProjectTaskInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = createProjectTaskSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: validatedData.projectId,
        name: validatedData.name,
        description: validatedData.description || null,
        assigneeId: validatedData.assigneeId || null,
        workstreamId: validatedData.workstreamId || null,
        status: validatedData.status,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        order: validatedData.order,
      },
    });

    void logActivity({
      projectId: validatedData.projectId,
      actorId: ctx.userId,
      action: "created",
      entity: "task",
      entityName: validatedData.name,
      description: `created task "${validatedData.name}"`,
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: task.id } };
  } catch (error: any) {
    console.error("Error creating task:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create task" };
  }
}

/**
 * Update a task
 */
export async function updateProjectTask(
  input: UpdateProjectTaskInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = updateProjectTaskSchema.parse(input);

    // Get task to check project permission
    const task = await prisma.projectTask.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const { allowed } = await canModifyProject(ctx.userId, task.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Build update data
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.assigneeId !== undefined) updateData.assigneeId = validatedData.assigneeId || null;
    if (validatedData.workstreamId !== undefined) updateData.workstreamId = validatedData.workstreamId || null;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.startDate !== undefined) {
      updateData.startDate = validatedData.startDate ? new Date(validatedData.startDate) : null;
    }
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null;
    }
    if (validatedData.order !== undefined) updateData.order = validatedData.order;

    const taskRecord = await prisma.projectTask.findUnique({
      where: { id: validatedData.id },
      select: { name: true },
    });

    await prisma.projectTask.update({
      where: { id: validatedData.id },
      data: updateData,
    });

    if (validatedData.status) {
      const statusLabel =
        validatedData.status === "DONE" ? "done" :
        validatedData.status === "IN_PROGRESS" ? "in progress" : "to do";
      void logActivity({
        projectId: task.projectId,
        actorId: ctx.userId,
        action: validatedData.status === "DONE" ? "completed" : "updated",
        entity: "task",
        entityName: taskRecord?.name ?? null,
        description: `marked "${taskRecord?.name ?? "task"}" as ${statusLabel}`,
      });
    }

    revalidatePath(`/dashboard/projects/${task.projectId}`);

    return { success: true, data: undefined };
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
export async function deleteProjectTask(
  input: DeleteProjectTaskInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = deleteProjectTaskSchema.parse(input);

    // Get task to check project permission
    const task = await prisma.projectTask.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const { allowed } = await canModifyProject(ctx.userId, task.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    await prisma.projectTask.delete({
      where: { id: validatedData.id },
    });

    revalidatePath(`/dashboard/projects/${task.projectId}`);

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error deleting task:", error);

    return { success: false, error: "Failed to delete task" };
  }
}

// ============================================
// PROJECT MEMBER OPERATIONS
// ============================================

/**
 * Add a member to a project
 */
export async function addProjectMember(
  input: AddProjectMemberInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = addProjectMemberSchema.parse(input);

    // Check permission (only owner/PIC can add members)
    const { isOwner } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!isOwner) {
      return { success: false, error: "Only project owner can add members" };
    }

    // Check if user exists in workspace
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        userId: validatedData.userId,
        workspace: {
          projects: {
            some: { id: validatedData.projectId },
          },
        },
      },
    });

    if (!workspaceMember) {
      return { success: false, error: "User not found in workspace" };
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: validatedData.projectId,
          userId: validatedData.userId,
        },
      },
    });

    if (existingMember) {
      return { success: false, error: "User is already a project member" };
    }

    await prisma.projectMember.create({
      data: {
        projectId: validatedData.projectId,
        userId: validatedData.userId,
        role: validatedData.role,
        access: validatedData.access,
      },
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error adding project member:", error);

    if (error.name === "ZodError") {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to add member" };
  }
}

/**
 * Remove a member from a project
 */
export async function removeProjectMember(
  input: RemoveProjectMemberInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    const validatedData = removeProjectMemberSchema.parse(input);

    // Check permission
    const { isOwner } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!isOwner) {
      return { success: false, error: "Only project owner can remove members" };
    }

    // Prevent removing the only owner
    const project = await prisma.project.findUnique({
      where: { id: validatedData.projectId },
      select: { createdById: true },
    });

    if (project?.createdById === validatedData.userId) {
      return { success: false, error: "Cannot remove the project creator" };
    }

    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId: validatedData.projectId,
          userId: validatedData.userId,
        },
      },
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error removing project member:", error);

    return { success: false, error: "Failed to remove member" };
  }
}

// ============================================
// QUICK ACTIONS
// ============================================

/**
 * Update project status quickly
 */
export async function updateProjectStatus(
  projectId: string,
  status: "ACTIVE" | "PLANNED" | "BACKLOG" | "COMPLETED" | "CANCELLED"
): Promise<ActionResult<void>> {
  const result = await updateProject({ id: projectId, status });
  if (!result.success) {
    return { success: false, error: result.error ?? "Project update failed" };
  }
  return { success: true, data: undefined };
}

/**
 * Update project progress
 */
export async function updateProjectProgress(
  projectId: string,
  progress: number
): Promise<ActionResult<void>> {
  const result = await updateProject({ id: projectId, progress: Math.min(100, Math.max(0, progress)) });
  if (!result.success) {
    return { success: false, error: result.error ?? "Project update failed" };
  }
  return { success: true, data: undefined };
}

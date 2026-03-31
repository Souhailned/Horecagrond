"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  deleteWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type DeleteWorkspaceInput,
} from "@/lib/validations/workspace";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { requirePermission } from "@/lib/session";

// Get paginated workspaces with search, sort, and filters
export async function getWorkspaces(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<ActionResult<{ workspaces: any[]; total: number; pageCount: number }>> {
  const authCheck = await requirePermission("platform:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {};

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { slug: { contains: params.search, mode: "insensitive" } },
      ];
    }

    // Get total count
    const total = await prisma.workspace.count({ where });

    // Get workspaces with pagination
    const workspaces = await prisma.workspace.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            members: true,
            invitations: true,
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: params?.sortBy
        ? { [params.sortBy]: params.sortOrder ?? "asc" }
        : { createdAt: "desc" },
    });

    const pageCount = Math.ceil(total / pageSize);

    return {
      success: true,
      data: { workspaces, total, pageCount },
    };
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return { success: false, error: "Failed to fetch workspaces" };
  }
}

// Get single workspace by ID
export async function getWorkspaceById(id: string): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("platform:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            invitations: true,
          },
        },
      },
    });

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    return { success: true, data: workspace };
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return { success: false, error: "Failed to fetch workspace" };
  }
}

// Create a new workspace
export async function createWorkspace(input: CreateWorkspaceInput): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("platform:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = createWorkspaceSchema.parse(input);

    // Check if workspace with slug already exists
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { slug: validatedData.slug },
    });

    if (existingWorkspace) {
      return { success: false, error: "Workspace with this slug already exists" };
    }

    // Get current user to add as owner
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "User session not found" };
    }

    // Create workspace with creator as owner
    const workspace = await prisma.workspace.create({
      data: {
        name: validatedData.name,
        slug: validatedData.slug,
        image: validatedData.image || null,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    revalidatePath("/admin/workspaces");

    return { success: true, data: workspace };
  } catch (error: any) {
    console.error("Error creating workspace:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to create workspace" };
  }
}

// Update a workspace
export async function updateWorkspace(input: UpdateWorkspaceInput): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("platform:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = updateWorkspaceSchema.parse(input);

    // Check if workspace exists
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id: validatedData.id },
    });

    if (!existingWorkspace) {
      return { success: false, error: "Workspace not found" };
    }

    // If slug is being updated, check for conflicts
    if (validatedData.slug && validatedData.slug !== existingWorkspace.slug) {
      const slugConflict = await prisma.workspace.findUnique({
        where: { slug: validatedData.slug },
      });

      if (slugConflict) {
        return { success: false, error: "Slug already in use" };
      }
    }

    // Build update data
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.slug !== undefined) updateData.slug = validatedData.slug;
    if (validatedData.image !== undefined) updateData.image = validatedData.image || null;

    // Update workspace
    const workspace = await prisma.workspace.update({
      where: { id: validatedData.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        updatedAt: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    revalidatePath("/admin/workspaces");
    revalidatePath(`/admin/workspaces/${validatedData.id}`);

    return { success: true, data: workspace };
  } catch (error: any) {
    console.error("Error updating workspace:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to update workspace" };
  }
}

// Delete a workspace
export async function deleteWorkspace(input: DeleteWorkspaceInput): Promise<ActionResult> {
  const authCheck = await requirePermission("platform:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = deleteWorkspaceSchema.parse(input);

    // Check if workspace exists
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id: validatedData.id },
      include: {
        _count: {
          select: {
            members: true,
            invitations: true,
          },
        },
      },
    });

    if (!existingWorkspace) {
      return { success: false, error: "Workspace not found" };
    }

    // Delete workspace (cascade will handle related records)
    await prisma.workspace.delete({
      where: { id: validatedData.id },
    });

    revalidatePath("/admin/workspaces");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error deleting workspace:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to delete workspace" };
  }
}

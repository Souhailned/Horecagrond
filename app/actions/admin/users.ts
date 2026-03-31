"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import {
  createUserSchema,
  updateUserSchema,
  deleteUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type DeleteUserInput,
} from "@/lib/validations/user";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { requirePermission } from "@/lib/session";

// Get paginated users with search, sort, and filters
export async function getUsers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  role?: string;
  status?: string;
}): Promise<ActionResult<{ users: any[]; total: number; pageCount: number }>> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {};

    if (params?.search) {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { name: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params?.role) {
      where.role = params.role;
    }

    if (params?.status) {
      where.status = params.status;
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        status: true,
        phone: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            workspaces: true,
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
      data: { users, total, pageCount },
    };
  } catch (error) {
    console.error("Error fetching users:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

// Get single user by ID
export async function getUserById(id: string): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        status: true,
        phone: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        workspaces: {
          select: {
            id: true,
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching user:", error);
    return { success: false, error: "Failed to fetch user" };
  }
}

// Create a new user
export async function createUser(input: CreateUserInput): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = createUserSchema.parse(input);

    // Check if user with email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return { success: false, error: "User with this email already exists" };
    }

    // Create user (generate ID using crypto.randomUUID or similar)
    const userId = crypto.randomUUID();
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: validatedData.email,
        name: validatedData.name,
        role: (validatedData.role as any) ?? "seeker",
        status: (validatedData.status as any) ?? "active",
        phone: validatedData.phone || null,
        image: validatedData.image || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        status: true,
        phone: true,
        createdAt: true,
      },
    });

    revalidatePath("/admin/users");

    return { success: true, data: user };
  } catch (error: any) {
    console.error("Error creating user:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to create user" };
  }
}

// Update a user
export async function updateUser(input: UpdateUserInput): Promise<ActionResult<any>> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = updateUserSchema.parse(input);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: validatedData.id },
    });

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    // If email is being updated, check for conflicts
    if (validatedData.email && validatedData.email !== existingUser.email) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (emailConflict) {
        return { success: false, error: "Email already in use" };
      }
    }

    // Build update data
    const updateData: any = {};
    if (validatedData.email !== undefined) updateData.email = validatedData.email;
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.role !== undefined) updateData.role = validatedData.role;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.phone !== undefined) updateData.phone = validatedData.phone || null;
    if (validatedData.image !== undefined) updateData.image = validatedData.image || null;

    // Update user
    const user = await prisma.user.update({
      where: { id: validatedData.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        status: true,
        phone: true,
        updatedAt: true,
      },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${validatedData.id}`);

    return { success: true, data: user };
  } catch (error: any) {
    console.error("Error updating user:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to update user" };
  }
}

// Delete a user
export async function deleteUser(input: DeleteUserInput): Promise<ActionResult> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Validate input
    const validatedData = deleteUserSchema.parse(input);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: validatedData.id },
    });

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    // Prevent deleting the current user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session?.user?.id === validatedData.id) {
      return { success: false, error: "Cannot delete your own account" };
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: validatedData.id },
    });

    revalidatePath("/admin/users");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error deleting user:", error);

    if (error.name === "ZodError") {
      return { success: false, error: error.issues[0]?.message ?? "Validation failed" };
    }

    return { success: false, error: "Failed to delete user" };
  }
}

"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { requirePermission } from "@/lib/session";

// Get impersonation status
export async function getImpersonationStatus(): Promise<
  ActionResult<{
    isImpersonating: boolean;
    impersonatedUser?: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
    };
    adminUser?: {
      id: string;
      email: string;
      name: string | null;
    };
  }>
> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return {
        success: true,
        data: { isImpersonating: false },
      };
    }

    // Get the session from database to check impersonatedBy field
    const dbSession = await prisma.session.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        impersonatedBy: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!dbSession?.impersonatedBy) {
      return {
        success: true,
        data: { isImpersonating: false },
      };
    }

    // Get admin user details
    const adminUser = await prisma.user.findUnique({
      where: { id: dbSession.impersonatedBy },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return {
      success: true,
      data: {
        isImpersonating: true,
        impersonatedUser: dbSession.user,
        adminUser: adminUser || undefined,
      },
    };
  } catch (error) {
    console.error("Error checking impersonation status:", error);
    return { success: false, error: "Failed to check impersonation status" };
  }
}

// Impersonate a user
export async function impersonateUser(userId: string): Promise<ActionResult> {
  const authCheck = await requirePermission("users:manage");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  try {
    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });

    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    if (targetUser.status !== "ACTIVE") {
      return {
        success: false,
        error: "Cannot impersonate non-active users",
      };
    }

    // Get current session to check if already impersonating
    const currentSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!currentSession?.user?.id) {
      return { success: false, error: "No active session" };
    }

    // Prevent self-impersonation
    if (currentSession.user.id === userId) {
      return { success: false, error: "Cannot impersonate yourself" };
    }

    // Call Better Auth admin API to impersonate user
    const result = await auth.api.impersonateUser({
      headers: await headers(),
      body: {
        userId: userId,
      },
    });

    if (!result) {
      return { success: false, error: "Failed to impersonate user" };
    }

    revalidatePath("/admin/impersonate");
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error impersonating user:", error);
    return {
      success: false,
      error: error.message || "Failed to impersonate user",
    };
  }
}

// Stop impersonating
export async function stopImpersonating(): Promise<ActionResult> {
  try {
    // Check if currently impersonating
    const status = await getImpersonationStatus();
    if (!status.success || !status.data?.isImpersonating) {
      return { success: false, error: "Not currently impersonating" };
    }

    // Call Better Auth admin API to stop impersonating
    await auth.api.stopImpersonating({
      headers: await headers(),
    });

    revalidatePath("/admin/impersonate");
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Error stopping impersonation:", error);
    return {
      success: false,
      error: error.message || "Failed to stop impersonation",
    };
  }
}

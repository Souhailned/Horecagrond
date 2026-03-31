"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "./user";
import type { ActionResult } from "@/types/actions";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validations/user-settings";

/**
 * Update the current user's profile settings
 */
export async function updateUserProfile(
  input: UpdateProfileInput
): Promise<ActionResult<{ name: string | null; phone: string | null }>> {
  try {
    // Check authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    // Validate input
    const validatedData = updateProfileSchema.parse(input);

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name: validatedData.name,
        phone: validatedData.phone === "" ? null : validatedData.phone,
        updatedAt: new Date(),
      },
      select: {
        name: true,
        phone: true,
      },
    });

    // Revalidate paths
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");

    return {
      success: true,
      data: updatedUser,
    };
  } catch (error) {
    console.error("Error updating user profile:", error);
    return {
      success: false,
      error: "Failed to update profile. Please try again.",
    };
  }
}

/**
 * Delete the current user's account (soft delete by setting status to DELETED)
 */
export async function deleteUserAccount(): Promise<ActionResult<void>> {
  try {
    // Check authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    // Soft delete by setting status to DELETED
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        status: "DELETED",
        updatedAt: new Date(),
      },
    });

    // Revalidate paths
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error deleting user account:", error);
    return {
      success: false,
      error: "Failed to delete account. Please try again.",
    };
  }
}

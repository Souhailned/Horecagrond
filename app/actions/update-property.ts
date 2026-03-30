"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission, authorizePropertyAccess } from "@/lib/session";
import { updatePropertySchema, type UpdatePropertyInput } from "@/lib/validations/property";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/types/actions";

export async function updateProperty(
  rawInput: UpdatePropertyInput
): Promise<ActionResult<{ slug: string }>> {
  try {
    // 1. Auth + RBAC check FIRST (before validation)
    const authCheck = await requirePermission("properties:edit-own");
    if (!authCheck.success) {
      return { success: false, error: authCheck.error };
    }
    const { userId, role } = authCheck.data;

    // 2. Validate input
    const parsed = updatePropertySchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      );
      return { success: false, error: `Validatie mislukt: ${fieldErrors.join(", ")}` };
    }
    const { id, ...data } = parsed.data;

    // 3. Agency-based ownership check (not just createdById)
    const accessCheck = await authorizePropertyAccess(userId, role, id);
    if (!accessCheck.success) {
      return { success: false, error: accessCheck.error };
    }

    // 4. Update only the provided fields
    const updated = await prisma.property.update({
      where: { id },
      data: data as Prisma.PropertyUpdateInput,
      select: { slug: true },
    });

    // 5. Revalidate cached pages — layout scope covers all sub-routes
    revalidatePath(`/dashboard/panden/${id}`, "layout");
    revalidatePath(`/aanbod/${updated.slug}`);

    return { success: true, data: { slug: updated.slug } };
  } catch (error) {
    console.error("updateProperty error:", error);
    return { success: false, error: "Er is een fout opgetreden bij het opslaan" };
  }
}

"use server";

import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export async function deleteProperty(propertyId: string) {
  const authCheck = await requirePermission("properties:delete-own");
  if (!authCheck.success) return { success: false, error: authCheck.error };

  const { userId, role } = authCheck.data!;

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
  });

  if (!property) return { error: "Pand niet gevonden of geen toegang" };

  // Soft delete - archive instead of hard delete
  await prisma.property.update({
    where: { id: propertyId },
    data: { status: "ARCHIVED" },
  });

  return { success: true, data: undefined };
}

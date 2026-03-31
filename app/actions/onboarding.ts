"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function completeOnboarding(data: Record<string, any>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Niet ingelogd");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultWorkspaceId: true, role: true },
  });

  // Create workspace if user doesn't have one
  let workspaceId = user?.defaultWorkspaceId;

  if (!workspaceId) {
    const workspaceName = data.agencyName || `${session.user.name || "Mijn"} Workspace`;
    const slug = workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") + `-${Date.now().toString(36)}`;

    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        members: {
          create: { userId: session.user.id, role: "OWNER" },
        },
      },
    });
    workspaceId = workspace.id;
  }

  // Update user
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      onboardingCompleted: true,
      defaultWorkspaceId: workspaceId,
      onboardingData: {
        ...data,
        completedAt: new Date().toISOString(),
      },
    },
  });

  // Create seeker profile if role is seeker
  if (user?.role === "seeker" && data.selectedTypes) {
    await prisma.seekerProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        preferredTypes: data.selectedTypes || [],
        preferredProvinces: data.selectedProvinces || [],
        budgetMin: data.budgetMin ? parseInt(data.budgetMin) * 100 : null,
        budgetMax: data.budgetMax ? parseInt(data.budgetMax) * 100 : null,
        conceptDescription: data.concept || null,
      },
      update: {
        preferredTypes: data.selectedTypes || [],
        preferredProvinces: data.selectedProvinces || [],
        budgetMin: data.budgetMin ? parseInt(data.budgetMin) * 100 : null,
        budgetMax: data.budgetMax ? parseInt(data.budgetMax) * 100 : null,
        conceptDescription: data.concept || null,
      },
    });
  }

  return { success: true, data: undefined };
}

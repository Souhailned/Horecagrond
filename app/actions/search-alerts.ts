"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface CreateAlertInput {
  name: string;
  cities?: string[];
  provinces?: string[];
  propertyTypes?: string[];
  priceMin?: number;
  priceMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  frequency?: "INSTANT" | "DAILY" | "WEEKLY";
}

export async function createSearchAlert(input: CreateAlertInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Je moet ingelogd zijn om een zoekopdracht op te slaan" };
  }

  const alert = await prisma.searchAlert.create({
    data: {
      userId: session.user.id,
      name: input.name,
      cities: input.cities || [],
      provinces: input.provinces || [],
      propertyTypes: input.propertyTypes as any[] || [],
      priceMin: input.priceMin ? input.priceMin * 100 : null,
      priceMax: input.priceMax ? input.priceMax * 100 : null,
      surfaceMin: input.surfaceMin,
      surfaceMax: input.surfaceMax,
      frequency: input.frequency || "DAILY",
      criteria: {
        cities: input.cities,
        provinces: input.provinces,
        propertyTypes: input.propertyTypes,
        priceMin: input.priceMin,
        priceMax: input.priceMax,
        surfaceMin: input.surfaceMin,
        surfaceMax: input.surfaceMax,
      },
    },
  });

  return { success: true, alertId: alert.id };
}

export async function getSearchAlerts() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return [];

  return prisma.searchAlert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteSearchAlert(alertId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Niet ingelogd" };
  }

  await prisma.searchAlert.delete({
    where: { id: alertId, userId: session.user.id },
  });

  return { success: true, data: undefined };
}

export async function toggleSearchAlert(alertId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Niet ingelogd" };
  }

  const alert = await prisma.searchAlert.findUnique({
    where: { id: alertId, userId: session.user.id },
  });

  if (!alert) return { error: "Alert niet gevonden" };

  await prisma.searchAlert.update({
    where: { id: alertId },
    data: { active: !alert.active },
  });

  return { success: true, active: !alert.active };
}

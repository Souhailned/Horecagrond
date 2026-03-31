import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/session";
import prisma from "@/lib/prisma";
import { PascalEditorWrapper } from "./editor-client";

/**
 * Full-page Pascal Editor route — no sidebar, no dashboard chrome.
 * Fetches property data server-side, then renders the Pascal Editor
 * client component at 100vh.
 */
export default async function EditorPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { userId, role } = await requirePagePermission("floorplans:manage");

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
    select: {
      id: true,
      title: true,
      floorPlans: {
        orderBy: { floor: "asc" },
        take: 1, // Get the first floor plan for initial scene
      },
    },
  });

  if (!property) notFound();

  // Pass the first floor plan's scene data as initial data
  const firstFloorPlan = property.floorPlans[0];
  const initialScene = firstFloorPlan?.sceneData ?? null;

  return (
    <PascalEditorWrapper
      propertyId={property.id}
      propertyTitle={property.title}
      floorPlanId={firstFloorPlan?.id ?? null}
      initialScene={initialScene as Record<string, unknown> | null}
      backHref={`/dashboard/panden/${property.id}`}
    />
  );
}

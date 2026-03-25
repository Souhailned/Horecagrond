import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/session";
import prisma from "@/lib/prisma";
import Link from "next/link";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FloorPlanEditorClient } from "./floor-plan-editor-client";
import type { FloorPlanData } from "@/app/actions/floor-plans";

export default async function PlattegrondPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, role } = await requirePagePermission("floorplans:manage");

  const property = await prisma.property.findFirst({
    where: { id, ...(role !== "admin" ? { createdById: userId } : {}) },
    select: {
      id: true,
      title: true,
      floorPlans: {
        orderBy: { floor: "asc" },
      },
    },
  });

  if (!property) notFound();

  return (
    <ContentCard className="!h-[calc(100vh-theme(spacing.6))] !flex-none">
      <ContentCardHeader
        title={`Plattegrond - ${property.title}`}
        actions={
          <Link href={`/dashboard/panden/${property.id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Terug
            </Button>
          </Link>
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <FloorPlanEditorClient
          propertyId={property.id}
          initialFloorPlans={property.floorPlans as FloorPlanData[]}
        />
      </div>
    </ContentCard>
  );
}

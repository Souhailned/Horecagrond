import { requirePagePermission } from "@/lib/session";
import prisma from "@/lib/prisma";
import Link from "next/link";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Blueprint, ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";

export default async function PlattegrondenPage() {
  const { userId, role } = await requirePagePermission("floorplans:manage");

  // Get all properties with floor plans for this user
  const properties = await prisma.property.findMany({
    where: {
      ...(role !== "admin" ? { createdById: userId } : {}),
    },
    select: {
      id: true,
      title: true,
      city: true,
      surfaceTotal: true,
      floorPlans: {
        select: {
          id: true,
          name: true,
          floor: true,
          totalArea: true,
          thumbnailUrl: true,
          updatedAt: true,
        },
        orderBy: { floor: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const propertiesWithPlans = properties.filter((p) => p.floorPlans.length > 0);
  const propertiesWithoutPlans = properties.filter((p) => p.floorPlans.length === 0);

  return (
    <ContentCard>
      <ContentCardHeader
        title="Plattegronden"
        actions={
          <Badge variant="secondary" className="font-normal">
            {propertiesWithPlans.length} panden met plattegronden
          </Badge>
        }
      />
      <ContentCardBody className="p-4">
        {properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-lg bg-muted p-3">
              <Blueprint className="h-6 w-6 text-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Nog geen panden
            </h3>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">
              Voeg eerst een pand toe om plattegronden te maken.
            </p>
            <Link href="/dashboard/panden/nieuw">
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Nieuw pand
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Properties with floor plans */}
            {propertiesWithPlans.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">
                  Panden met plattegronden
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {propertiesWithPlans.map((property) => (
                    <Link
                      key={property.id}
                      href={`/editor/${property.id}`}
                      className="group flex flex-col gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {property.title || "Naamloos pand"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {property.city}
                            {property.surfaceTotal
                              ? ` · ${property.surfaceTotal}m²`
                              : ""}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {property.floorPlans.map((fp) => (
                          <Badge
                            key={fp.id}
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            {fp.name}
                            {fp.totalArea ? ` · ${fp.totalArea.toFixed(0)}m²` : ""}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Laatst bewerkt:{" "}
                        {property.floorPlans[0]?.updatedAt
                          ? new Date(property.floorPlans[0].updatedAt).toLocaleDateString("nl-NL")
                          : "—"}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Properties without floor plans */}
            {propertiesWithoutPlans.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Panden zonder plattegrond
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {propertiesWithoutPlans.slice(0, 6).map((property) => (
                    <Link
                      key={property.id}
                      href={`/editor/${property.id}`}
                      className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {property.title || "Naamloos pand"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {property.city || "Geen stad"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 text-xs">
                        <Plus className="mr-1 h-3 w-3" />
                        Maak
                      </Button>
                    </Link>
                  ))}
                  {propertiesWithoutPlans.length > 6 && (
                    <p className="col-span-full text-xs text-muted-foreground">
                      +{propertiesWithoutPlans.length - 6} meer panden
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </ContentCardBody>
    </ContentCard>
  );
}

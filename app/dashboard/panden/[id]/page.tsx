import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/property/status-badge";
import { Pencil, ExternalLink, Eye, Heart, MessageCircle, Copy, Trash2, Layers } from "lucide-react";
import { ContentCard, ContentCardHeader, ContentCardBody } from "@/components/dashboard/content-card";

export default async function PandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const property = await prisma.property.findFirst({
    where: { id, createdById: session.user.id },
    include: {
      _count: {
        select: { inquiries: true, favorites: true, views: true },
      },
    },
  });

  if (!property) notFound();

  const price = property.rentPrice || property.salePrice;
  const formatted = price
    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price / 100)
    : "Prijs n.t.b.";

  return (
    <ContentCard>
      <ContentCardHeader
        title={property.title}
        actions={
          <div className="flex gap-2">
            <Link href={`/aanbod/${property.slug}`} target="_blank">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Bekijken
              </Button>
            </Link>
            <Link href={`/dashboard/panden/${property.id}/bewerken`}>
              <Button size="sm">
                <Pencil className="mr-1.5 h-4 w-4" />
                Bewerken
              </Button>
            </Link>
          </div>
        }
      />
      <ContentCardBody className="p-4">
        <div className="mx-auto max-w-4xl">

      <div className="flex items-center gap-3 mb-6">
        <StatusBadge status={property.status} />
        <span className="text-muted-foreground">{property.address}, {property.postalCode} {property.city}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{property.viewCount}</p>
            <p className="text-xs text-muted-foreground">Views</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Heart className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{property._count.favorites}</p>
            <p className="text-xs text-muted-foreground">Favorieten</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageCircle className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{property._count.inquiries}</p>
            <p className="text-xs text-muted-foreground">Aanvragen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatted}</p>
            <p className="text-xs text-muted-foreground">
              {property.priceType === "RENT" ? "per maand" : "koopprijs"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kenmerken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{property.propertyType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Oppervlakte</span>
              <span className="font-medium">{property.surfaceTotal} m²</span>
            </div>
            {property.buildYear && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bouwjaar</span>
                <span className="font-medium">{property.buildYear}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gepubliceerd</span>
              <span className="font-medium">
                {property.publishedAt
                  ? new Date(property.publishedAt).toLocaleDateString("nl-NL")
                  : "Nog niet gepubliceerd"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href={`/dashboard/panden/${property.id}/bewerken`} className="block">
              <Button variant="outline" className="w-full justify-start">
                <Pencil className="mr-2 h-4 w-4" /> Bewerken
              </Button>
            </Link>
            <Link href={`/editor/${property.id}`} className="block">
              <Button variant="outline" className="w-full justify-start">
                <Layers className="mr-2 h-4 w-4" /> Plattegrond
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start">
              <Copy className="mr-2 h-4 w-4" /> Dupliceren
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Archiveren
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {property.description && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Beschrijving</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.description}</p>
          </CardContent>
        </Card>
      )}

        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

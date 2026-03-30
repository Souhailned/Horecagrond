"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { updateProperty } from "@/app/actions/update-property";
import { StatusBadge } from "@/components/property/status-badge";
import { Save } from "lucide-react";
import { ListingTurboDialog } from "@/components/listing-turbo/listing-turbo-dialog";

interface EditPropertyFormProps {
  property: {
    id: string;
    title: string;
    description: string | null;
    shortDescription: string | null;
    address: string;
    postalCode: string;
    city: string;
    rentPrice: number | null;
    salePrice: number | null;
    priceType: string;
    propertyType: string;
    surfaceTotal: number;
    buildYear: number | null;
    status: string;
    seatingCapacityInside: number | null;
  };
}

export function EditPropertyForm({ property }: EditPropertyFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: property.title,
    description: property.description || "",
    shortDescription: property.shortDescription || "",
    address: property.address,
    postalCode: property.postalCode,
    city: property.city,
    rentPrice: property.rentPrice ? String(property.rentPrice / 100) : "",
    salePrice: property.salePrice ? String(property.salePrice / 100) : "",
    surfaceTotal: String(property.surfaceTotal),
    buildYear: property.buildYear ? String(property.buildYear) : "",
  });

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const result = await updateProperty({
        id: property.id,
        title: form.title,
        description: form.description || undefined,
        shortDescription: form.shortDescription || undefined,
        address: form.address,
        postalCode: form.postalCode,
        city: form.city,
        rentPrice: form.rentPrice ? Math.round(parseFloat(form.rentPrice) * 100) : undefined,
        salePrice: form.salePrice ? Math.round(parseFloat(form.salePrice) * 100) : undefined,
        surfaceTotal: parseInt(form.surfaceTotal) || 0,
        buildYear: form.buildYear ? parseInt(form.buildYear) : undefined,
      });

      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("Pand bijgewerkt!");
        router.push("/dashboard/panden");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3">
        <StatusBadge status={property.status} />
        <ListingTurboDialog
          input={{
            propertyType: property.propertyType,
            title: form.title || property.title,
            city: form.city || property.city,
            surface: property.surfaceTotal,
            rentPrice: property.rentPrice || undefined,
            salePrice: property.salePrice || undefined,
            priceType: property.priceType as "RENT" | "SALE" | "BOTH",
            features: [],
            buildYear: property.buildYear || undefined,
            seatingCapacity: property.seatingCapacityInside || undefined,
          }}
          onApplyDescription={(desc) => update("description", desc)}
          onApplyShortDescription={(desc) => update("shortDescription", desc)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Basisgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Titel</label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Korte beschrijving</label>
            <Input value={form.shortDescription} onChange={(e) => update("shortDescription", e.target.value)} placeholder="Max 160 tekens" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Beschrijving</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Locatie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Adres</label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Postcode</label>
              <Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Stad</label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} required />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Huurprijs (€/mnd)</label>
              <Input type="number" step="0.01" value={form.rentPrice} onChange={(e) => update("rentPrice", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Koopprijs (€)</label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={(e) => update("salePrice", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Oppervlakte (m²)</label>
              <Input type="number" value={form.surfaceTotal} onChange={(e) => update("surfaceTotal", e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Bouwjaar</label>
              <Input type="number" value={form.buildYear} onChange={(e) => update("buildYear", e.target.value)} placeholder="bijv. 1985" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuleren
        </Button>
        <Button type="submit" disabled={isPending}>
          <Save className="mr-1.5 h-4 w-4" />
          {isPending ? "Opslaan..." : "Opslaan"}
        </Button>
      </div>
    </form>
  );
}

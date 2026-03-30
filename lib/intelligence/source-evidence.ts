import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  INTELLIGENCE_SOURCE_REGISTRY,
  type IntelligenceSourceId,
} from "@/lib/intelligence/source-registry";

type ConfidenceLevel = "low" | "medium" | "high";

function toDateHoursFromNow(hours: number, baseDate: Date): Date {
  return new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
}

function nonNullCount(record: Record<string, unknown>): number {
  return Object.values(record).filter((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }).length;
}

function inferConfidence(
  qualityScore: number,
  maxScore: number,
): ConfidenceLevel {
  if (qualityScore >= Math.max(3, Math.ceil(maxScore * 0.66))) return "high";
  if (qualityScore >= Math.max(1, Math.ceil(maxScore * 0.33))) return "medium";
  return "low";
}

function computeQualityScore(
  source: IntelligenceSourceId,
  facts: Record<string, unknown>,
): number {
  if (source === "news") {
    const itemCount =
      typeof facts.itemCount === "number" ? facts.itemCount : 0;
    const hasOvername = facts.hasOvernameSignal === true ? 1 : 0;
    const hasFaillissement = facts.hasFaillissementSignal === true ? 1 : 0;
    return itemCount > 0 ? itemCount + hasOvername + hasFaillissement : hasOvername + hasFaillissement;
  }

  return nonNullCount(facts);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function buildSourceEvidenceSnapshot(
  source: IntelligenceSourceId,
  payload: unknown,
  options?: {
    fetchedAt?: Date;
    url?: string | null;
    error?: string | null;
  },
): {
  source: string;
  status: string;
  schemaVersion: string;
  confidence: string;
  qualityScore: number;
  fetchedAt: Date | null;
  expiresAt: Date | null;
  url: string | null;
  facts: Prisma.InputJsonValue | null;
  error: string | null;
} {
  const fetchedAt = options?.fetchedAt ?? new Date();
  const definition = INTELLIGENCE_SOURCE_REGISTRY[source];

  if (payload == null) {
    return {
      source,
      status: options?.error ? "failed" : "missing",
      schemaVersion: "v1",
      confidence: "low",
      qualityScore: 0,
      fetchedAt: options?.error ? fetchedAt : null,
      expiresAt: null,
      url: options?.url ?? null,
      facts: null,
      error: options?.error ?? null,
    };
  }

  let facts: Record<string, unknown>;

  switch (source) {
    case "google_places": {
      const data = asRecord(payload) ?? {};
      const types = Array.isArray(data.types) ? data.types : [];
      facts = {
        rating: data.currentRating ?? data.rating ?? null,
        totalReviews: data.totalReviews ?? data.reviewCount ?? null,
        isOpen: data.isOpen ?? null,
        hasWebsite: !!data.website,
        hasPhone: !!data.phone,
        typeCount: types.length,
      };
      break;
    }
    case "kvk": {
      const data = asRecord(payload) ?? {};
      facts = {
        kvkNumber: data.kvkNumber ?? null,
        eigenaar: data.eigenaar ?? null,
        rechtsvorm: data.rechtsvorm ?? null,
        isKeten: data.isKeten ?? null,
        ketenGrootte: data.ketenGrootte ?? null,
      };
      break;
    }
    case "tripadvisor": {
      const data = asRecord(payload) ?? {};
      facts = {
        rating: data.rating ?? null,
        totalReviews: data.totalReviews ?? null,
        cuisineType: data.cuisineType ?? null,
        ranking: data.ranking ?? null,
      };
      break;
    }
    case "thuisbezorgd": {
      const data = asRecord(payload) ?? {};
      const menuItems = Array.isArray(data.menuItems) ? data.menuItems : [];
      const cuisineTypes = Array.isArray(data.cuisineTypes) ? data.cuisineTypes : [];
      facts = {
        rating: data.rating ?? null,
        reviewCount: data.reviewCount ?? null,
        menuItemsCount: menuItems.length,
        cuisineTypesCount: cuisineTypes.length,
        deliveryTime: data.deliveryTime ?? null,
      };
      break;
    }
    case "allecijfers": {
      const data = asRecord(payload) ?? {};
      facts = {
        buurtNaam: data.buurtNaam ?? null,
        inwoners: data.inwoners ?? null,
        woningwaarde: data.woningwaarde ?? null,
        bedrijfsvestigingen: data.bedrijfsvestigingen ?? null,
      };
      break;
    }
    case "website": {
      const data = asRecord(payload) ?? {};
      const menuItems = Array.isArray(data.menuItems) ? data.menuItems : [];
      const languages = Array.isArray(data.languages) ? data.languages : [];
      facts = {
        concept: data.concept ?? null,
        hasDelivery: data.hasDelivery ?? null,
        hasOnlineReservation: data.hasOnlineReservation ?? null,
        menuItemsCount: menuItems.length,
        languageCount: languages.length,
      };
      break;
    }
    case "news": {
      const data = asRecord(payload) ?? {};
      const items = Array.isArray(data.items) ? data.items : [];
      facts = {
        hasOvernameSignal: data.hasOvernameSignal ?? null,
        hasFaillissementSignal: data.hasFaillissementSignal ?? null,
        itemCount: items.length,
      };
      break;
    }
    case "competitors": {
      const data = asRecord(payload) ?? {};
      const competitors = Array.isArray(data.competitors) ? data.competitors : [];
      facts = {
        competitorCount: competitors.length,
        avgRating: data.avgRating ?? null,
        dominantCuisine: data.dominantCuisine ?? null,
        competitorDensity: data.competitorDensity ?? null,
      };
      break;
    }
    case "cbs":
    case "bag":
    case "transport":
    case "osm": {
      const data = asRecord(payload) ?? {};
      facts = data;
      break;
    }
  }

  const qualityScore = computeQualityScore(source, facts);
  return {
    source,
    status: "fetched",
    schemaVersion: "v1",
    confidence: inferConfidence(qualityScore, Object.keys(facts).length),
    qualityScore,
    fetchedAt,
    expiresAt: toDateHoursFromNow(definition.freshnessHours, fetchedAt),
    url: options?.url ?? null,
    facts: facts as Prisma.InputJsonValue,
    error: options?.error ?? null,
  };
}

export async function upsertSourceEvidence(
  prisma: PrismaClient,
  businessId: string,
  source: IntelligenceSourceId,
  payload: unknown,
  options?: {
    fetchedAt?: Date;
    url?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const snapshot = buildSourceEvidenceSnapshot(source, payload, options);
  await prisma.businessSourceEvidence.upsert({
    where: {
      businessId_source: {
        businessId,
        source,
      },
    },
    update: {
      ...snapshot,
      facts: snapshot.facts ?? Prisma.JsonNull,
    },
    create: {
      businessId,
      ...snapshot,
      facts: snapshot.facts ?? Prisma.JsonNull,
    },
  });
}

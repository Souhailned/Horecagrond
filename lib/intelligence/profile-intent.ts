import type {
  CrawledBusinessIntel,
  IntelligenceProfile,
  MonitoredBusiness,
} from "@/generated/prisma/client";
import type { PlaceSearchDetail } from "@/lib/buurt/providers/google-places";

type ScanCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "bakery"
  | "meal_takeaway"
  | "meal_delivery";

export type BusinessRelevanceTier =
  | "exact"
  | "adjacent"
  | "conversion"
  | "irrelevant";

interface ConceptDefinition {
  key: string;
  label: string;
  aliases: string[];
  exactTags: string[];
  primaryTags: string[];
  relatedTags: string[];
  excludedTags: string[];
  scanCategories: ScanCategory[];
  genericTerms: string[];
}

interface ProfileInputLike {
  name?: string | null;
  concept?: string | null;
  conceptDescription?: string | null;
  competitorKeywords?: string[] | null;
  operatingModel?: string[] | null;
}

export interface NormalizedProfileIntent {
  conceptKey: string;
  conceptLabel: string;
  exactTags: string[];
  primaryTerms: string[];
  adjacentTerms: string[];
  genericTerms: string[];
  scanCategories: ScanCategory[];
  requiredTags: string[];
  relatedTags: string[];
  excludedTags: string[];
  preferredServiceModels: string[];
  profileTokens: string[];
}

export interface ConceptAssessment {
  tier: BusinessRelevanceTier;
  score: number;
  matchedTags: string[];
  conflictingTags: string[];
  inferredTags: string[];
  inferredBusinessType: string | null;
}

const CONCEPT_DEFINITIONS: ConceptDefinition[] = [
  {
    key: "turkish_restaurant",
    label: "Turks restaurant",
    aliases: [
      "turks restaurant",
      "turkse keuken",
      "turkish restaurant",
      "turkish grill",
      "grillroom",
      "doner",
      "doner kebab",
      "kebab",
      "mezze",
      "anatolian grill",
    ],
    exactTags: ["turkish", "kebab"],
    primaryTags: ["turkish", "kebab", "grill", "mediterranean", "restaurant"],
    relatedTags: ["middle_eastern", "lunchroom", "meal_takeaway"],
    excludedTags: ["burger", "fastfood", "fried_chicken", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "afhaalrestaurant"],
  },
  {
    key: "poke_bowl",
    label: "Poké bowl",
    aliases: ["poke bowl", "pokebowl", "poké bowl", "poke", "bowl restaurant"],
    exactTags: ["poke", "bowl"],
    primaryTags: ["poke", "bowl", "healthy", "asian", "restaurant"],
    relatedTags: ["sushi", "salad", "lunchroom", "meal_takeaway"],
    excludedTags: ["burger", "fastfood", "fried_chicken", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "lunchroom", "healthy lunch"],
  },
  {
    key: "sushi",
    label: "Sushi",
    aliases: ["sushi", "japanese restaurant", "sushi bar", "japanse keuken"],
    exactTags: ["sushi"],
    primaryTags: ["sushi", "japanese", "asian", "restaurant"],
    relatedTags: ["poke", "ramen", "meal_delivery", "meal_takeaway"],
    excludedTags: ["burger", "fastfood", "fried_chicken", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "afhaalrestaurant"],
  },
  {
    key: "ramen",
    label: "Ramen",
    aliases: ["ramen", "ramen bar", "japanese noodles", "ramen restaurant"],
    exactTags: ["ramen"],
    primaryTags: ["ramen", "japanese", "asian", "restaurant"],
    relatedTags: ["sushi", "poke", "meal_takeaway"],
    excludedTags: ["burger", "fastfood", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant"],
  },
  {
    key: "koffiebar",
    label: "Koffiebar",
    aliases: ["koffiebar", "coffee bar", "specialty coffee", "espresso bar"],
    exactTags: ["coffee"],
    primaryTags: ["coffee", "cafe"],
    relatedTags: ["bakery", "lunchroom"],
    excludedTags: ["burger", "fried_chicken", "kebab"],
    scanCategories: ["cafe", "bakery"],
    genericTerms: ["cafe", "bakery", "lunchroom"],
  },
  {
    key: "lunchroom",
    label: "Lunchroom",
    aliases: ["lunchroom", "broodjeszaak", "sandwich shop", "brunch cafe"],
    exactTags: ["lunchroom", "sandwich"],
    primaryTags: ["lunchroom", "sandwich", "cafe"],
    relatedTags: ["coffee", "bakery", "healthy", "meal_takeaway"],
    excludedTags: ["burger", "fried_chicken", "ice_cream"],
    scanCategories: ["restaurant", "cafe", "meal_takeaway"],
    genericTerms: ["lunchroom", "cafe", "restaurant"],
  },
  {
    key: "fast_casual",
    label: "Fast casual",
    aliases: ["fast casual", "healthy fast casual", "quick service"],
    exactTags: ["fast_casual"],
    primaryTags: ["fast_casual", "healthy", "restaurant"],
    relatedTags: ["poke", "lunchroom", "meal_takeaway", "meal_delivery"],
    excludedTags: ["bar", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "lunchroom"],
  },
  {
    key: "bakery",
    label: "Bakkerij",
    aliases: ["bakkerij", "bakery", "patisserie", "brood", "pastry shop"],
    exactTags: ["bakery"],
    primaryTags: ["bakery", "cafe"],
    relatedTags: ["coffee", "lunchroom"],
    excludedTags: ["burger", "fried_chicken", "kebab"],
    scanCategories: ["bakery", "cafe"],
    genericTerms: ["bakery", "cafe"],
  },
  {
    key: "pizzeria",
    label: "Pizzeria",
    aliases: ["pizzeria", "pizza restaurant", "pizza", "italian pizza"],
    exactTags: ["pizza"],
    primaryTags: ["pizza", "italian", "restaurant"],
    relatedTags: ["meal_delivery", "meal_takeaway"],
    excludedTags: ["sushi", "poke", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "afhaalrestaurant"],
  },
  {
    key: "burger",
    label: "Burgerbar",
    aliases: ["burgerbar", "burger", "hamburger restaurant", "smash burger"],
    exactTags: ["burger"],
    primaryTags: ["burger", "fastfood", "restaurant"],
    relatedTags: ["meal_takeaway", "meal_delivery"],
    excludedTags: ["sushi", "poke", "ice_cream"],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "afhaalrestaurant"],
  },
  {
    key: "ice_cream",
    label: "IJssalon",
    aliases: ["ijssalon", "gelato", "ice cream", "ice cream shop"],
    exactTags: ["ice_cream"],
    primaryTags: ["ice_cream"],
    relatedTags: ["dessert", "cafe"],
    excludedTags: ["burger", "sushi", "kebab"],
    scanCategories: ["bakery", "cafe"],
    genericTerms: ["ijssalon", "dessert shop"],
  },
  {
    key: "bar",
    label: "Bar / Cafe",
    aliases: ["bar", "cocktailbar", "cafe", "wine bar", "pub"],
    exactTags: ["bar"],
    primaryTags: ["bar", "cafe"],
    relatedTags: ["restaurant"],
    excludedTags: ["poke", "sushi", "kebab"],
    scanCategories: ["bar", "cafe"],
    genericTerms: ["bar", "cafe"],
  },
  {
    key: "restaurant",
    label: "Restaurant",
    aliases: ["restaurant", "eetcafe", "brasserie", "bistro"],
    exactTags: ["restaurant"],
    primaryTags: ["restaurant"],
    relatedTags: ["meal_takeaway", "meal_delivery", "lunchroom"],
    excludedTags: [],
    scanCategories: ["restaurant", "meal_takeaway", "meal_delivery"],
    genericTerms: ["restaurant", "eetcafe", "lunchroom"],
  },
];

const TERM_TAGS: Record<string, string[]> = {
  "turks restaurant": ["turkish", "restaurant"],
  "turkse keuken": ["turkish", "restaurant"],
  "turkish restaurant": ["turkish", "restaurant"],
  "turkish grill": ["turkish", "grill"],
  "middle eastern": ["middle_eastern", "mediterranean"],
  "mediterraans": ["mediterranean"],
  "mediterranean": ["mediterranean"],
  doner: ["turkish", "kebab"],
  "döner": ["turkish", "kebab"],
  kebab: ["turkish", "kebab"],
  shawarma: ["middle_eastern", "meal_takeaway"],
  mezze: ["mediterranean", "restaurant"],
  grillroom: ["turkish", "grill", "meal_takeaway"],
  turks: ["turkish"],
  turkse: ["turkish"],
  turkish: ["turkish"],
  poke: ["poke", "bowl", "healthy"],
  "poke bowl": ["poke", "bowl", "healthy"],
  "poké bowl": ["poke", "bowl", "healthy"],
  sushi: ["sushi", "japanese"],
  ramen: ["ramen", "japanese"],
  japans: ["japanese"],
  japanese: ["japanese"],
  bowl: ["bowl"],
  healthy: ["healthy"],
  salad: ["healthy"],
  salads: ["healthy"],
  lunchroom: ["lunchroom", "cafe"],
  broodjeszaak: ["lunchroom", "sandwich"],
  sandwich: ["sandwich", "lunchroom"],
  brunch: ["lunchroom"],
  koffie: ["coffee", "cafe"],
  coffee: ["coffee", "cafe"],
  espresso: ["coffee", "cafe"],
  bakery: ["bakery"],
  bakkerij: ["bakery"],
  patisserie: ["bakery"],
  pizza: ["pizza", "italian"],
  pizzeria: ["pizza", "italian"],
  burger: ["burger", "fastfood"],
  burgers: ["burger", "fastfood"],
  hamburger: ["burger", "fastfood"],
  mcdonald: ["burger", "fastfood", "chain"],
  "burger king": ["burger", "fastfood", "chain"],
  kfc: ["fried_chicken", "fastfood", "chain"],
  "fried chicken": ["fried_chicken", "fastfood"],
  bar: ["bar"],
  cocktailbar: ["bar"],
  cafe: ["cafe"],
  café: ["cafe"],
  pub: ["bar"],
  bezorging: ["meal_delivery"],
  delivery: ["meal_delivery"],
  takeaway: ["meal_takeaway"],
  afhaal: ["meal_takeaway"],
  restaurant: ["restaurant"],
  eetcafe: ["restaurant"],
  brasserie: ["restaurant"],
  bistro: ["restaurant"],
};

const GOOGLE_TYPE_TAGS: Record<string, string[]> = {
  restaurant: ["restaurant"],
  mediterranean_restaurant: ["mediterranean", "restaurant"],
  middle_eastern_restaurant: ["middle_eastern", "restaurant"],
  turkish_restaurant: ["turkish", "restaurant"],
  sushi_restaurant: ["sushi", "japanese", "restaurant"],
  japanese_restaurant: ["japanese", "restaurant"],
  ramen_restaurant: ["ramen", "japanese", "restaurant"],
  pizza_restaurant: ["pizza", "italian", "restaurant"],
  hamburger_restaurant: ["burger", "fastfood", "restaurant"],
  fast_food_restaurant: ["fastfood", "meal_takeaway"],
  cafe: ["cafe", "coffee"],
  coffee_shop: ["coffee", "cafe"],
  bakery: ["bakery"],
  bar: ["bar"],
  meal_takeaway: ["meal_takeaway"],
  meal_delivery: ["meal_delivery"],
  sandwich_shop: ["sandwich", "lunchroom"],
  brunch_restaurant: ["lunchroom", "restaurant"],
  ice_cream_shop: ["ice_cream"],
  kebab_shop: ["turkish", "kebab", "meal_takeaway"],
};

const SERVICE_MODEL_HINTS: Record<string, string[]> = {
  eat_in: ["eat_in"],
  afhaal: ["meal_takeaway"],
  bezorging: ["meal_delivery"],
};

const CATEGORY_TO_QUERY_TERM: Record<ScanCategory, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  bakery: "bakery",
  meal_takeaway: "afhaalrestaurant",
  meal_delivery: "bezorgrestaurant",
};

const CUISINE_TAGS = new Set([
  "turkish",
  "mediterranean",
  "middle_eastern",
  "japanese",
  "sushi",
  "ramen",
  "poke",
  "italian",
  "burger",
  "fried_chicken",
  "coffee",
  "bakery",
  "ice_cream",
]);

const GENERIC_MATCH_TAGS = new Set([
  "restaurant",
  "meal_takeaway",
  "meal_delivery",
]);

const BUSINESS_TYPE_PRIORITY = [
  "turkish_restaurant",
  "poke_bowl",
  "sushi",
  "ramen",
  "koffiebar",
  "lunchroom",
  "bakery",
  "pizzeria",
  "burger",
  "ice_cream",
  "bar",
  "restaurant",
] as const;

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function extractTagsFromText(value: string): string[] {
  if (!value) return [];

  const normalized = ` ${normalizeText(value)} `;
  const tags = new Set<string>();

  for (const [term, termTags] of Object.entries(TERM_TAGS)) {
    const needle = ` ${normalizeText(term)} `;
    if (normalized.includes(needle)) {
      for (const tag of termTags) tags.add(tag);
    }
  }

  return [...tags];
}

function resolveConceptDefinition(profile: ProfileInputLike): ConceptDefinition {
  const conceptValue = normalizeText(profile.concept ?? "");
  const searchSpace = [
    profile.name,
    profile.concept,
    profile.conceptDescription,
    ...(profile.competitorKeywords ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const hits = extractTagsFromText(searchSpace);
  const shouldPreferSpecificInference =
    conceptValue === "" ||
    conceptValue === "restaurant" ||
    conceptValue === "other";

  if (!shouldPreferSpecificInference) {
    const directDefinition = CONCEPT_DEFINITIONS.find((definition) =>
      normalizeText(definition.key) === conceptValue,
    );
    if (directDefinition) return directDefinition;
  }

  if (hits.includes("turkish")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "turkish_restaurant")!;
  }
  if (hits.includes("poke")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "poke_bowl")!;
  }
  if (hits.includes("sushi")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "sushi")!;
  }
  if (hits.includes("ramen")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "ramen")!;
  }
  if (hits.includes("coffee")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "koffiebar")!;
  }
  if (hits.includes("lunchroom") || hits.includes("sandwich")) {
    return CONCEPT_DEFINITIONS.find((definition) => definition.key === "lunchroom")!;
  }

  const directDefinition = CONCEPT_DEFINITIONS.find((definition) =>
    normalizeText(definition.key) === conceptValue,
  );
  if (directDefinition) return directDefinition;

  return CONCEPT_DEFINITIONS.find((definition) => definition.key === "restaurant")!;
}

export function buildProfileIntent(profile: ProfileInputLike): NormalizedProfileIntent {
  const definition = resolveConceptDefinition(profile);
  const allProfileText = [
    profile.name ?? "",
    profile.concept ?? "",
    profile.conceptDescription ?? "",
    ...(profile.competitorKeywords ?? []),
  ].join(" ");
  const extractedTags = extractTagsFromText(allProfileText);
  const profileKeywords = unique(
    (profile.competitorKeywords ?? []).map((keyword) => normalizeText(keyword)),
  );
  const extractedAliasTerms = definition.aliases.filter((alias) =>
    normalizeText(allProfileText).includes(normalizeText(alias)),
  );
  const preferredServiceModels = unique([
    ...(profile.operatingModel ?? []).flatMap((item) => SERVICE_MODEL_HINTS[item] ?? []),
    ...extractTagsFromText(profile.conceptDescription ?? "")
      .filter((tag) => tag === "meal_delivery" || tag === "meal_takeaway"),
  ]);

  const requiredTags = unique([...definition.primaryTags, ...extractedTags]);
  const relatedTags = unique([
    ...definition.relatedTags,
    ...(requiredTags.includes("healthy") ? ["lunchroom"] : []),
  ]);
  const excludedTags = unique(definition.excludedTags);
  const primaryTerms = unique([
    ...definition.aliases,
    ...profileKeywords,
    ...extractedAliasTerms,
  ]).slice(0, 12);
  const adjacentTerms = unique(
    relatedTags
      .map((tag) => {
        switch (tag) {
          case "lunchroom":
            return "lunchroom";
          case "sandwich":
            return "sandwich shop";
          case "coffee":
            return "coffee bar";
          case "bakery":
            return "bakery";
          case "meal_takeaway":
            return "afhaalrestaurant";
          case "meal_delivery":
            return "bezorgrestaurant";
          case "sushi":
            return "sushi";
          case "poke":
            return "poke bowl";
          case "ramen":
            return "ramen";
          case "middle_eastern":
            return "middle eastern restaurant";
          default:
            return null;
        }
      })
      .filter(Boolean),
  ).slice(0, 6);
  const scanCategories = unique([
    ...definition.scanCategories,
    ...preferredServiceModels.flatMap((tag) => {
      if (tag === "meal_delivery") return ["meal_delivery"] as ScanCategory[];
      if (tag === "meal_takeaway") return ["meal_takeaway"] as ScanCategory[];
      return [];
    }),
  ]) as ScanCategory[];
  const genericTerms = unique([
    ...definition.genericTerms,
    ...scanCategories.map((category) => CATEGORY_TO_QUERY_TERM[category]),
  ]).slice(0, 5);

  return {
    conceptKey: definition.key,
    conceptLabel: definition.label,
    exactTags: definition.exactTags,
    primaryTerms,
    adjacentTerms,
    genericTerms,
    scanCategories,
    requiredTags,
    relatedTags,
    excludedTags,
    preferredServiceModels,
    profileTokens: unique([
      normalizeText(profile.name ?? ""),
      normalizeText(profile.concept ?? ""),
      normalizeText(profile.conceptDescription ?? ""),
      ...profileKeywords,
    ]),
  };
}

export function deriveScanCategories(profile: ProfileInputLike): string[] {
  return buildProfileIntent(profile).scanCategories;
}

export function buildKeywordSetFromProfile(
  profile: ProfileInputLike,
  includeGeneric: boolean = true,
): { primary: string[]; secondary: string[]; all: string[] } {
  const intent = buildProfileIntent(profile);
  const primary = unique([...intent.primaryTerms, ...intent.adjacentTerms]).slice(0, 16);
  const secondary = includeGeneric ? intent.genericTerms : [];

  return {
    primary,
    secondary,
    all: [...primary, ...secondary],
  };
}

function collectTagsFromTypes(types: string[]): string[] {
  const tags = new Set<string>();
  for (const type of types) {
    for (const tag of GOOGLE_TYPE_TAGS[type] ?? []) {
      tags.add(tag);
    }
  }
  return [...tags];
}

function collectWebsiteTags(intel: CrawledBusinessIntel | null): string[] {
  if (!intel) return [];

  const tags = new Set<string>();
  const websiteData = intel.websiteData as Record<string, unknown> | null;
  const thuisbezorgdData = intel.thuisbezorgdData as Record<string, unknown> | null;
  const tripadvisorData = intel.tripadvisorData as Record<string, unknown> | null;

  if (websiteData?.concept && typeof websiteData.concept === "string") {
    for (const tag of extractTagsFromText(websiteData.concept)) tags.add(tag);
  }

  const websiteMenuItems = Array.isArray(websiteData?.menuItems)
    ? websiteData.menuItems
    : [];
  for (const item of websiteMenuItems) {
    if (item && typeof item === "object") {
      const menuItem = item as Record<string, unknown>;
      for (const field of ["name", "category"] as const) {
        const value = menuItem[field];
        if (typeof value === "string") {
          for (const tag of extractTagsFromText(value)) tags.add(tag);
        }
      }
    }
  }

  if (Array.isArray(thuisbezorgdData?.cuisineTypes)) {
    for (const cuisine of thuisbezorgdData.cuisineTypes) {
      if (typeof cuisine === "string") {
        for (const tag of extractTagsFromText(cuisine)) tags.add(tag);
      }
    }
  }

  if (Array.isArray(thuisbezorgdData?.menuItems)) {
    for (const item of thuisbezorgdData.menuItems) {
      if (item && typeof item === "object") {
        const menuItem = item as Record<string, unknown>;
        for (const field of ["name", "category", "description"] as const) {
          const value = menuItem[field];
          if (typeof value === "string") {
            for (const tag of extractTagsFromText(value)) tags.add(tag);
          }
        }
      }
    }
  }

  if (typeof tripadvisorData?.cuisineType === "string") {
    for (const tag of extractTagsFromText(tripadvisorData.cuisineType)) tags.add(tag);
  }

  return [...tags];
}

function deriveBusinessTypeFromTags(tags: string[]): string | null {
  const tagSet = new Set(tags);
  for (const conceptKey of BUSINESS_TYPE_PRIORITY) {
    const definition = CONCEPT_DEFINITIONS.find((item) => item.key === conceptKey);
    if (!definition) continue;

    const distinctivePrimaryTags = definition.exactTags.filter(
      (tag) => !GENERIC_MATCH_TAGS.has(tag),
    );
    const hasDistinctiveMatch =
      distinctivePrimaryTags.length > 0 &&
      distinctivePrimaryTags.some((tag) => tagSet.has(tag));
    const hasGenericFallbackMatch =
      distinctivePrimaryTags.length === 0 &&
      definition.primaryTags.some((tag) => tagSet.has(tag));

    if (hasDistinctiveMatch || hasGenericFallbackMatch) {
      return definition.key;
    }
  }

  return null;
}

function getAllowedTags(intent: NormalizedProfileIntent): Set<string> {
  return new Set([
    ...intent.requiredTags,
    ...intent.relatedTags,
    ...intent.scanCategories,
    "restaurant",
    ...intent.preferredServiceModels,
  ]);
}

function assessTags(
  intent: NormalizedProfileIntent,
  tags: string[],
): ConceptAssessment {
  const tagSet = new Set(tags);
  const allowedTags = getAllowedTags(intent);
  const exactDistinctiveTags = intent.exactTags.filter(
    (tag) => !GENERIC_MATCH_TAGS.has(tag),
  );
  const requiredDistinctiveTags = intent.requiredTags.filter(
    (tag) => !GENERIC_MATCH_TAGS.has(tag),
  );
  const relatedDistinctiveTags = intent.relatedTags.filter(
    (tag) => !GENERIC_MATCH_TAGS.has(tag),
  );
  const exactMatches = (
    exactDistinctiveTags.length > 0 ? exactDistinctiveTags : requiredDistinctiveTags
  ).filter((tag) => tagSet.has(tag));
  const matchedTags = (
    requiredDistinctiveTags.length > 0 ? requiredDistinctiveTags : intent.requiredTags
  ).filter((tag) => tagSet.has(tag));
  const relatedMatches = (
    relatedDistinctiveTags.length > 0 ? relatedDistinctiveTags : intent.relatedTags
  ).filter((tag) => tagSet.has(tag));
  const conflictingTags = intent.excludedTags.filter((tag) => tagSet.has(tag));
  const inferredBusinessType = deriveBusinessTypeFromTags(tags);

  const inferredCuisineTags = tags.filter((tag) => CUISINE_TAGS.has(tag));
  const allowedCuisineTags = new Set(
    [...intent.requiredTags, ...intent.relatedTags].filter((tag) => CUISINE_TAGS.has(tag)),
  );
  const hasConflictingCuisine =
    allowedCuisineTags.size > 0 &&
    inferredCuisineTags.length > 0 &&
    !inferredCuisineTags.some((tag) => allowedCuisineTags.has(tag));

  const shouldDowngradeForConflicts =
    conflictingTags.length > 0 &&
    exactMatches.length <= 1 &&
    relatedMatches.length === 0;

  if (exactMatches.length > 0 && !shouldDowngradeForConflicts) {
    return {
      tier: "exact",
      score: Math.min(
        25,
        18 +
          exactMatches.length * 3 +
          Math.max(0, matchedTags.length - exactMatches.length) * 2 +
          relatedMatches.length,
      ),
      matchedTags: matchedTags.length > 0 ? matchedTags : exactMatches,
      conflictingTags,
      inferredTags: [...tagSet],
      inferredBusinessType,
    };
  }

  if (matchedTags.length > 0 || relatedMatches.length > 0) {
    const combinedMatches = unique([...matchedTags, ...relatedMatches]);
    return {
      tier: "adjacent",
      score: Math.min(
        19,
        10 + combinedMatches.length * 3 - (conflictingTags.length > 0 ? 2 : 0),
      ),
      matchedTags: combinedMatches,
      conflictingTags,
      inferredTags: [...tagSet],
      inferredBusinessType,
    };
  }

  if (conflictingTags.length > 0 || hasConflictingCuisine) {
    return {
      tier: "irrelevant",
      score: 0,
      matchedTags: [],
      conflictingTags: unique([
        ...conflictingTags,
        ...(hasConflictingCuisine ? inferredCuisineTags : []),
      ]),
      inferredTags: [...tagSet],
      inferredBusinessType,
    };
  }

  const genericMatches = [...tagSet].filter((tag) => allowedTags.has(tag));
  if (genericMatches.length > 0) {
    return {
      tier: "conversion",
      score: Math.min(12, 6 + genericMatches.length * 2),
      matchedTags: genericMatches,
      conflictingTags: [],
      inferredTags: [...tagSet],
      inferredBusinessType,
    };
  }

  return {
    tier: "irrelevant",
    score: 0,
    matchedTags: [],
    conflictingTags: [],
    inferredTags: [...tagSet],
    inferredBusinessType,
  };
}

export function assessPlaceAgainstProfile(
  place: Pick<PlaceSearchDetail, "name" | "types" | "website" | "address">,
  profile: ProfileInputLike,
): ConceptAssessment {
  const intent = buildProfileIntent(profile);
  const tags = unique([
    ...extractTagsFromText(place.name),
    ...extractTagsFromText(place.address),
    ...extractTagsFromText(place.website ?? ""),
    ...collectTagsFromTypes(place.types),
  ]);

  return assessTags(intent, tags);
}

export function assessBusinessAgainstProfile(
  business: Pick<MonitoredBusiness, "name" | "address" | "types" | "businessType" | "website">,
  profile: IntelligenceProfile | ProfileInputLike,
  intel: CrawledBusinessIntel | null = null,
): ConceptAssessment {
  const intent = buildProfileIntent(profile);
  const tags = unique([
    ...extractTagsFromText(business.name),
    ...extractTagsFromText(business.address),
    ...extractTagsFromText(business.businessType ?? ""),
    ...extractTagsFromText(business.website ?? ""),
    ...collectTagsFromTypes(business.types),
    ...collectWebsiteTags(intel),
  ]);

  return assessTags(intent, tags);
}

export function inferBusinessTypeFromPlace(
  place: Pick<PlaceSearchDetail, "name" | "types" | "website" | "address">,
): string | null {
  const tags = unique([
    ...extractTagsFromText(place.name),
    ...extractTagsFromText(place.address),
    ...extractTagsFromText(place.website ?? ""),
    ...collectTagsFromTypes(place.types),
  ]);

  return deriveBusinessTypeFromTags(tags);
}

export function inferBusinessTypeFromBusiness(
  business: Pick<MonitoredBusiness, "name" | "address" | "types" | "website" | "businessType">,
  intel: CrawledBusinessIntel | null = null,
): string | null {
  const tags = unique([
    ...extractTagsFromText(business.name),
    ...extractTagsFromText(business.address),
    ...extractTagsFromText(business.businessType ?? ""),
    ...extractTagsFromText(business.website ?? ""),
    ...collectTagsFromTypes(business.types),
    ...collectWebsiteTags(intel),
  ]);

  return deriveBusinessTypeFromTags(tags);
}

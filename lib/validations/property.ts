import { z } from "zod";

// ============================================================================
// Property Enums (matching Prisma schema from PRD 1.1)
// ============================================================================

// PropertyType comes from @/types/property (Prisma is source of truth)
// Don't re-export here — consumers should import from @/types/property directly

export const PropertyStatus = {
  DRAFT: "DRAFT",
  PENDING_REVIEW: "PENDING_REVIEW",
  ACTIVE: "ACTIVE",
  UNDER_OFFER: "UNDER_OFFER",
  RENTED: "RENTED",
  SOLD: "SOLD",
  ARCHIVED: "ARCHIVED",
  REJECTED: "REJECTED",
} as const;

export const PriceType = {
  RENT: "RENT",
  SALE: "SALE",
  RENT_OR_SALE: "RENT_OR_SALE",
} as const;

export const FeatureCategory = {
  LICENSE: "LICENSE",
  FACILITY: "FACILITY",
  UTILITY: "UTILITY",
  ACCESSIBILITY: "ACCESSIBILITY",
} as const;

export const PropertyImageType = {
  EXTERIOR: "EXTERIOR",
  INTERIOR: "INTERIOR",
  KITCHEN: "KITCHEN",
  TERRACE: "TERRACE",
  BATHROOM: "BATHROOM",
  STORAGE: "STORAGE",
  FLOORPLAN: "FLOORPLAN",
  LOCATION: "LOCATION",
  RENDER: "RENDER",
  OTHER: "OTHER",
} as const;

// ============================================================================
// Zod Enums
// ============================================================================

// Property Type enum — must match Prisma PropertyType exactly
export const propertyTypeEnum = z.enum([
  "RESTAURANT",
  "CAFE",
  "BAR",
  "HOTEL",
  "DARK_KITCHEN",
  "NIGHTCLUB",
  "FOOD_COURT",
  "FOOD_TRUCK_SPOT",
  "CATERING",
  "BAKERY",
  "EETCAFE",
  "GRAND_CAFE",
  "COCKTAILBAR",
  "HOTEL_RESTAURANT",
  "BED_AND_BREAKFAST",
  "LUNCHROOM",
  "KOFFIEBAR",
  "BRASSERIE",
  "PIZZERIA",
  "SNACKBAR",
  "IJSSALON",
  "WOK_RESTAURANT",
  "SUSHI",
  "BEZORG_AFHAAL",
  "PARTYCENTRUM",
  "STRANDPAVILJOEN",
  "PANNENKOEKHUIS",
  "TEAROOM",
  "WIJNBAR",
  "BROUWERIJ_CAFE",
  "LEISURE",
  "OTHER",
]);

// Property Status enum
export const propertyStatusEnum = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "UNDER_OFFER",
  "RENTED",
  "SOLD",
  "ARCHIVED",
  "REJECTED",
]);

// Price Type enum
export const priceTypeEnum = z.enum(["RENT", "SALE", "RENT_OR_SALE"]);

// Feature Category enum
export const featureCategoryEnum = z.enum([
  "LICENSE",
  "FACILITY",
  "UTILITY",
  "ACCESSIBILITY",
]);

export const propertyImageTypeEnum = z.enum([
  "EXTERIOR",
  "INTERIOR",
  "KITCHEN",
  "TERRACE",
  "BATHROOM",
  "STORAGE",
  "FLOORPLAN",
  "LOCATION",
  "RENDER",
  "OTHER",
]);

// Sort options for property listings
export const propertySortByEnum = z.enum([
  "createdAt",
  "publishedAt",
  "rentPrice",
  "salePrice",
  "surfaceTotal",
  "viewCount",
  "inquiryCount",
  "title",
]);

// Alias for backward compatibility
export const sortByEnum = z.enum([
  "publishedAt",
  "rentPrice",
  "salePrice",
  "surfaceTotal",
  "viewCount",
]);

export const sortOrderEnum = z.enum(["asc", "desc"]);

// ============================================================================
// Property Filter Schema
// ============================================================================

// Property filter schema for search
export const propertyFilterSchema = z.object({
  cities: z.array(z.string()).optional(),
  provinces: z.array(z.string()).optional(),
  propertyTypes: z.array(propertyTypeEnum).optional(),
  priceType: priceTypeEnum.optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  surfaceMin: z.number().int().nonnegative().optional(),
  surfaceMax: z.number().int().nonnegative().optional(),
  features: z.array(z.string()).optional(),
  hasTerrace: z.boolean().optional(),
  hasKitchen: z.boolean().optional(),
  hasBasement: z.boolean().optional(),
  hasStorage: z.boolean().optional(),
  hasParking: z.boolean().optional(),
  seatingCapacityMin: z.number().int().positive().optional(),
  seatingCapacityMax: z.number().int().positive().optional(),
});

// ============================================================================
// List Properties Schema (with pagination, sorting, filters)
// ============================================================================

// List properties schema with pagination
export const listPropertiesSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: propertySortByEnum.default("createdAt"),
  sortOrder: sortOrderEnum.default("desc"),
  filters: propertyFilterSchema.optional(),
  search: z.string().max(200).optional(),
});

// ============================================================================
// Create Property Schema
// ============================================================================

// Create property schema
export const createPropertySchema = z.object({
  // Required fields
  title: z
    .string()
    .min(5, "Titel moet minimaal 5 karakters zijn")
    .max(200, "Titel mag maximaal 200 karakters zijn"),
  propertyType: propertyTypeEnum,
  priceType: priceTypeEnum,
  address: z.string().min(1, "Adres is verplicht"),
  city: z.string().min(1, "Stad is verplicht"),
  postalCode: z.string().min(1, "Postcode is verplicht"),
  surfaceTotal: z.number().int().positive("Totale oppervlakte is verplicht"),

  // Optional text fields
  description: z.string().max(5000, "Beschrijving mag maximaal 5000 karakters zijn").optional(),
  shortDescription: z.string().max(200, "Korte beschrijving mag maximaal 200 karakters zijn").optional(),
  addressLine2: z.string().optional(),
  province: z.string().optional(),
  country: z.string().default("NL"),
  neighborhood: z.string().optional(),

  // Optional pricing fields (in cents)
  rentPrice: z.number().int().positive("Huurprijs moet positief zijn").optional(),
  rentPriceMin: z.number().int().positive().optional(),
  salePrice: z.number().int().positive("Verkoopprijs moet positief zijn").optional(),
  salePriceMin: z.number().int().positive().optional(),
  priceNegotiable: z.boolean().default(true),
  servicesCosts: z.number().int().nonnegative().optional(),
  depositMonths: z.number().int().nonnegative().optional(),

  // Optional location fields
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  // Optional dimension fields
  surfaceCommercial: z.number().int().positive().optional(),
  surfaceKitchen: z.number().int().positive().optional(),
  surfaceStorage: z.number().int().positive().optional(),
  surfaceTerrace: z.number().int().positive().optional(),
  surfaceBasement: z.number().int().positive().optional(),
  floors: z.number().int().positive().default(1),
  ceilingHeight: z.number().positive().optional(),

  // Optional horeca specifics
  seatingCapacityInside: z.number().int().nonnegative().optional(),
  seatingCapacityOutside: z.number().int().nonnegative().optional(),
  standingCapacity: z.number().int().nonnegative().optional(),
  kitchenType: z.string().optional(),
  hasBasement: z.boolean().default(false),
  hasStorage: z.boolean().default(false),
  hasTerrace: z.boolean().default(false),
  hasParking: z.boolean().default(false),
  parkingSpaces: z.number().int().nonnegative().optional(),

  // Optional previous use fields
  previousUse: z.string().optional(),
  wasHoreca: z.boolean().optional(),
  previousHorecaType: propertyTypeEnum.optional(),
  yearsHoreca: z.number().int().nonnegative().optional(),

  // Optional building fields
  buildYear: z.number().int().min(1800).max(2100).optional(),
  lastRenovation: z.number().int().min(1800).max(2100).optional(),
  monumentStatus: z.boolean().optional(),
  energyLabel: z.string().optional(),

  // Optional scores
  horecaScore: z.string().optional(),
  horecaScoreDetails: z.record(z.string(), z.unknown()).optional(),
  locationScore: z.number().int().min(0).max(100).optional(),
  footfallEstimate: z.number().int().nonnegative().optional(),

  // Optional SEO fields
  metaTitle: z.string().max(60).optional(),
  metaDescription: z.string().max(160).optional(),
  featured: z.boolean().default(false),
  featuredUntil: z.date().optional(),
  boostUntil: z.date().optional(),

  // Optional availability fields
  availableFrom: z.date().optional(),
  availableUntil: z.date().optional(),
  minimumLeaseTerm: z.number().int().positive().optional(),
});

// ============================================================================
// Update Property Schema (all fields optional)
// ============================================================================

// Update property schema (all optional)
/** User-facing update schema — no admin-only fields */
export const updatePropertySchema = createPropertySchema.partial().extend({
  id: z.string().min(1, "Property ID is verplicht"),
  // Status can only be set via update (not create)
  status: propertyStatusEnum.optional(),
});

/** Admin-only update schema — extends user schema with admin fields */
export const adminUpdatePropertySchema = updatePropertySchema.extend({
  adminNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

// ============================================================================
// Search Properties Schema (legacy support)
// ============================================================================

// Search properties schema for backward compatibility
export const searchPropertiesSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(12),
  sortBy: z.enum(["newest", "price_low_high", "price_high_low", "area"]).default("newest"),
  search: z.string().max(200).optional(),
  cities: z.array(z.string()).optional(),
  types: z.array(propertyTypeEnum).optional(),
  statuses: z.array(propertyStatusEnum).optional(),
  publishedWithinDays: z.number().int().positive().max(365).optional(),
  buildPeriods: z.array(z.string()).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  areaMin: z.number().int().nonnegative().optional(),
  areaMax: z.number().int().nonnegative().optional(),
  features: z.array(z.string()).optional(),
  // Radius search
  lat: z.number().optional(),
  lng: z.number().optional(),
  radius: z.number().positive().max(100).optional(), // km
});

export type SearchPropertiesInput = z.infer<typeof searchPropertiesSchema>;

// ============================================================================
// Sort Options Enum (for legacy compatibility)
// ============================================================================

export const SortOption = {
  NEWEST: "newest",
  PRICE_LOW_HIGH: "price_low_high",
  PRICE_HIGH_LOW: "price_high_low",
  AREA: "area",
} as const;

const sortOptionEnum = z.enum(["newest", "price_low_high", "price_high_low", "area"]);
export type SortOption = z.infer<typeof sortOptionEnum>;

// ============================================================================
// Additional Action Schemas
// ============================================================================

// Publish/unpublish schema
export const publishPropertySchema = z.object({
  id: z.string().min(1, "Property ID is verplicht"),
});

export const unpublishPropertySchema = z.object({
  id: z.string().min(1, "Property ID is verplicht"),
});

// Delete property schema
export const deletePropertySchema = z.object({
  id: z.string().min(1, "Property ID is verplicht"),
});

// Property image schema
export const propertyImageSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  originalUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  mediumUrl: z.string().url().optional(),
  largeUrl: z.string().url().optional(),
  enhancedUrl: z.string().url().optional(),
  type: propertyImageTypeEnum.default("INTERIOR"),
  caption: z.string().optional(),
  altText: z.string().optional(),
  order: z.number().int().default(0),
  isPrimary: z.boolean().default(false),
  aiProcessed: z.boolean().default(false),
});

// Property feature schema
export const propertyFeatureSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  category: featureCategoryEnum,
  key: z.string(),
  value: z.string().optional(),
  numericValue: z.number().optional(),
  booleanValue: z.boolean().optional(),
  verified: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  highlighted: z.boolean().default(false),
});

// ============================================================================
// Property Inquiry and View Schemas
// ============================================================================

// Property inquiry schema for contact form
export const propertyInquirySchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  name: z.string().min(2, "Naam moet minimaal 2 karakters zijn").max(100, "Naam is te lang"),
  email: z.string().email("Ongeldig e-mailadres"),
  phone: z.string().min(10, "Telefoonnummer moet minimaal 10 cijfers zijn").max(15, "Telefoonnummer is te lang").optional().or(z.literal("")),
  message: z.string().min(10, "Bericht moet minimaal 10 karakters zijn").max(2000, "Bericht is te lang"),
  conceptDescription: z.string().max(1000, "Concept beschrijving is te lang").optional().or(z.literal("")),
  budget: z.number().min(0, "Budget moet positief zijn").optional().nullable(),
  intendedUse: z.string().optional().or(z.literal("")),
});

// Schema for recording property views
export const propertyViewSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  sessionId: z.string().optional(),
  source: z.string().optional(),
  deviceType: z.enum(["mobile", "desktop", "tablet"]).optional(),
});

// ============================================================================
// TypeScript Types from Enums and Schemas
// ============================================================================

// TypeScript types
export type PropertyType = z.infer<typeof propertyTypeEnum>;
export type PropertyStatus = z.infer<typeof propertyStatusEnum>;
export type PriceType = z.infer<typeof priceTypeEnum>;
export type FeatureCategory = z.infer<typeof featureCategoryEnum>;
export type PropertyImageType = z.infer<typeof propertyImageTypeEnum>;
export type PropertySortBy = z.infer<typeof propertySortByEnum>;
export type SortBy = z.infer<typeof sortByEnum>;
export type SortOrder = z.infer<typeof sortOrderEnum>;

export type PropertyFilterInput = z.infer<typeof propertyFilterSchema>;
export type PropertyFilter = PropertyFilterInput; // Alias for backward compatibility
export type ListPropertiesInput = z.infer<typeof listPropertiesSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type AdminUpdatePropertyInput = z.infer<typeof adminUpdatePropertySchema>;
export type PublishPropertyInput = z.infer<typeof publishPropertySchema>;
export type UnpublishPropertyInput = z.infer<typeof unpublishPropertySchema>;
export type DeletePropertyInput = z.infer<typeof deletePropertySchema>;
export type PropertyImage = z.infer<typeof propertyImageSchema>;
export type PropertyFeature = z.infer<typeof propertyFeatureSchema>;
export type PropertyInquiryInput = z.infer<typeof propertyInquirySchema>;
export type PropertyViewInput = z.infer<typeof propertyViewSchema>;

// ============================================================================
// Full Property Interface (for display)
// ============================================================================

export interface Property {
  id: string;
  agencyId: string;
  createdById: string;

  // Basic info
  title: string;
  slug: string;
  description?: string;
  shortDescription?: string;

  // Location
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  province?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  neighborhood?: string;

  // Pricing (in cents)
  priceType: PriceType;
  rentPrice?: number;
  rentPriceMin?: number;
  salePrice?: number;
  salePriceMin?: number;
  priceNegotiable: boolean;
  servicesCosts?: number;
  depositMonths?: number;

  // Legacy pricing properties (for backward compatibility)
  price?: number; // Derived from rentPrice or salePrice based on priceType
  area?: number; // Alias for surfaceTotal

  // Dimensions
  surfaceTotal: number;
  surfaceCommercial?: number;
  surfaceKitchen?: number;
  surfaceStorage?: number;
  surfaceTerrace?: number;
  surfaceBasement?: number;
  floors: number;
  ceilingHeight?: number;

  // Classification
  propertyType: PropertyType;
  status: PropertyStatus;

  // Legacy type property (for backward compatibility)
  type: PropertyType; // Alias for propertyType

  // Horeca specifics
  seatingCapacityInside?: number;
  seatingCapacityOutside?: number;
  standingCapacity?: number;
  kitchenType?: string;
  hasBasement: boolean;
  hasStorage: boolean;
  hasTerrace: boolean;
  hasParking: boolean;
  parkingSpaces?: number;

  // Previous use
  previousUse?: string;
  wasHoreca?: boolean;
  previousHorecaType?: PropertyType;
  yearsHoreca?: number;

  // Building
  buildYear?: number;
  lastRenovation?: number;
  monumentStatus?: boolean;
  energyLabel?: string;

  // Scores
  horecaScore?: string;
  horecaScoreDetails?: Record<string, unknown>;
  locationScore?: number;
  footfallEstimate?: number;

  // SEO
  metaTitle?: string;
  metaDescription?: string;
  featured: boolean;
  featuredUntil?: Date;
  boostUntil?: Date;

  // Availability
  availableFrom?: Date;
  availableUntil?: Date;
  minimumLeaseTerm?: number;

  // Publishing
  publishedAt?: Date;
  expiresAt?: Date;
  viewCount: number;
  inquiryCount: number;
  savedCount: number;

  // Admin
  adminNotes?: string;
  rejectionReason?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  images?: PropertyImage[];
  propertyFeatures?: PropertyFeature[]; // Renamed to avoid conflict
  
  // Legacy features property (for backward compatibility)
  features?: string[]; // Array of feature keys for easier filtering

  agency?: {
    id: string;
    name: string;
    slug: string;
    logo?: string;
  };
  createdBy?: {
    id: string;
    name?: string;
    email: string;
  };
}

// ============================================================================
// Helper Labels (Dutch)
// ============================================================================

// Helper for property type labels — import from types/property.ts for single source
import { PropertyTypeLabels as _ptLabels, REGIONS as _regions } from "@/types/property";
export const propertyTypeLabels = _ptLabels;

// Alias for backward compatibility
export const PROPERTY_TYPE_LABELS = propertyTypeLabels;

// Re-export REGIONS from central types
export const REGIONS = _regions;

// Helper for property status labels
export const propertyStatusLabels: Record<PropertyStatus, string> = {
  DRAFT: "Concept",
  PENDING_REVIEW: "In Review",
  ACTIVE: "Actief",
  UNDER_OFFER: "Onder Bod",
  RENTED: "Verhuurd",
  SOLD: "Verkocht",
  ARCHIVED: "Gearchiveerd",
  REJECTED: "Afgewezen",
};

// Helper for price type labels
export const priceTypeLabels: Record<PriceType, string> = {
  RENT: "Te Huur",
  SALE: "Te Koop",
  RENT_OR_SALE: "Te Huur / Te Koop",
};

// Alias for backward compatibility
export const PRICE_TYPE_LABELS = priceTypeLabels;

// Helper for feature category labels
export const featureCategoryLabels: Record<FeatureCategory, string> = {
  LICENSE: "Vergunningen",
  FACILITY: "Faciliteiten",
  UTILITY: "Voorzieningen",
  ACCESSIBILITY: "Toegankelijkheid",
};

// Available features per category
export const availableFeatures: Record<FeatureCategory, Array<{ key: string; label: string; type: "boolean" | "string" | "number" }>> = {
  LICENSE: [
    { key: "alcohol_license", label: "Alcoholvergunning", type: "boolean" },
    { key: "alcohol_license_hours", label: "Alcoholvergunning tot", type: "string" },
    { key: "terrace_license", label: "Terrasvergunning", type: "boolean" },
    { key: "terrace_size", label: "Terrasomvang (m²)", type: "number" },
    { key: "music_license", label: "Muziekvergunning", type: "boolean" },
    { key: "late_night_license", label: "Nachtvergunning", type: "boolean" },
    { key: "food_license", label: "Horecavergunning", type: "boolean" },
    { key: "exploitation_license", label: "Exploitatievergunning", type: "boolean" },
  ],
  FACILITY: [
    { key: "professional_kitchen", label: "Professionele keuken", type: "boolean" },
    { key: "extraction_system", label: "Afzuigsysteem", type: "boolean" },
    { key: "cold_storage", label: "Koelcel", type: "boolean" },
    { key: "freezer_storage", label: "Vriezer", type: "boolean" },
    { key: "dishwasher", label: "Vaatwasmachine", type: "boolean" },
    { key: "bar_setup", label: "Bar opstelling", type: "boolean" },
    { key: "coffee_setup", label: "Koffie opstelling", type: "boolean" },
    { key: "sound_system", label: "Geluidssysteem", type: "boolean" },
    { key: "loading_dock", label: "Laaddok", type: "boolean" },
  ],
  UTILITY: [
    { key: "air_conditioning", label: "Airconditioning", type: "boolean" },
    { key: "heating", label: "Verwarming", type: "boolean" },
    { key: "wifi", label: "WiFi", type: "boolean" },
    { key: "security_system", label: "Beveiligingssysteem", type: "boolean" },
    { key: "cctv", label: "Camerabewaking", type: "boolean" },
    { key: "pos_system", label: "Kassasysteem", type: "boolean" },
    { key: "delivery_door", label: "Leveranciersingang", type: "boolean" },
  ],
  ACCESSIBILITY: [
    { key: "wheelchair_accessible", label: "Rolstoeltoegankelijk", type: "boolean" },
    { key: "accessible_toilet", label: "Invalidentoilet", type: "boolean" },
    { key: "elevator", label: "Lift", type: "boolean" },
    { key: "ground_floor", label: "Begane grond", type: "boolean" },
    { key: "public_transport", label: "OV bereikbaar", type: "boolean" },
    { key: "parking_nearby", label: "Parkeren in de buurt", type: "boolean" },
  ],
};

// Common Dutch cities for filters
export const DUTCH_CITIES = [
  "Amsterdam",
  "Rotterdam",
  "Den Haag",
  "Utrecht",
  "Eindhoven",
  "Groningen",
  "Tilburg",
  "Almere",
  "Breda",
  "Nijmegen",
  "Enschede",
  "Haarlem",
  "Arnhem",
  "Zaanstad",
  "Amersfoort",
  "Apeldoorn",
  "Hoofddorp",
  "Maastricht",
  "Leiden",
  "Dordrecht",
] as const;

// Popular features for filtering
export const POPULAR_FEATURES = [
  { key: "alcohol_license", label: "Alcoholvergunning", category: "LICENSE" },
  { key: "terrace_license", label: "Terrasvergunning", category: "LICENSE" },
  { key: "extraction_system", label: "Afzuigsysteem", category: "FACILITY" },
  { key: "professional_kitchen", label: "Professionele keuken", category: "FACILITY" },
  { key: "cold_storage", label: "Koelcel", category: "FACILITY" },
  { key: "wheelchair_accessible", label: "Rolstoeltoegankelijk", category: "ACCESSIBILITY" },
  { key: "air_conditioning", label: "Airconditioning", category: "UTILITY" },
  { key: "loading_dock", label: "Laaddok", category: "FACILITY" },
] as const;

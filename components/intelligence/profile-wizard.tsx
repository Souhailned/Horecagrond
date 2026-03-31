"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Users,
  Gear,
  Crosshair,
  Storefront,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";

import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { createIntelligenceProfile } from "@/app/actions/intelligence";
import { startScan } from "@/app/actions/intelligence-scan";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DUTCH_CITIES,
  LOCATION_TYPES,
  CONCEPT_TYPES,
  VISIBILITY_OPTIONS,
  OPERATING_MODEL_OPTIONS,
  ENVIRONMENT_SUGGESTIONS,
} from "@/lib/intelligence/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardData {
  name: string;
  concept: string;
  conceptDescription: string;
  clientName: string;
  clientEmail: string;
  targetCities: string[];
  locationTypes: string[];
  minSurface?: number;
  maxSurface?: number;
  targetAge?: string;
  minIncome?: number;
  minPassanten?: number;
  competitorKeywords: string[];
  includeChains: boolean;
  minChainSize?: number;
  maxChainSize?: number;
  visibilityPrefs: string[];
  operatingModel: string[];
  excludeIndustrial: boolean;
  excludeResidential: boolean;
  minCityPopulation?: number;
  positiveEnvironment: string[];
  negativeEnvironment: string[];
}

const INITIAL_DATA: WizardData = {
  name: "",
  concept: "",
  conceptDescription: "",
  clientName: "",
  clientEmail: "",
  targetCities: [],
  locationTypes: [],
  minSurface: undefined,
  maxSurface: undefined,
  targetAge: undefined,
  minIncome: undefined,
  minPassanten: undefined,
  competitorKeywords: [],
  includeChains: true,
  minChainSize: undefined,
  maxChainSize: undefined,
  visibilityPrefs: [],
  operatingModel: [],
  excludeIndustrial: true,
  excludeResidential: true,
  minCityPopulation: undefined,
  positiveEnvironment: [],
  negativeEnvironment: [],
};

// ---------------------------------------------------------------------------
// Step configuration
// ---------------------------------------------------------------------------

const STEPS = [
  { key: "concept", label: "Concept", icon: Storefront },
  { key: "locaties", label: "Locaties", icon: MapPin },
  { key: "doelgroep", label: "Doelgroep", icon: Users },
  { key: "instellingen", label: "Instellingen", icon: Gear },
  { key: "review", label: "Review", icon: Crosshair },
] as const;

const POPULAR_CITIES = ["Amsterdam", "Utrecht", "Rotterdam", "Den Haag"] as const;

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

export function ProfileWizard() {
  const router = useRouter();
  const { isAgent, isSeeker } = usePermissions();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = useCallback(
    <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
      setData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0:
        return data.name.trim().length >= 2 && data.concept !== "";
      case 1:
        return data.targetCities.length >= 1;
      case 2:
        return true; // All fields optional
      case 3:
        return data.competitorKeywords.length >= 1;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, data]);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1 && canAdvance()) {
      setStep((s) => s + 1);
    }
  }, [step, canAdvance]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const result = await createIntelligenceProfile({
        name: data.name.trim(),
        concept: data.concept,
        conceptDescription: data.conceptDescription || undefined,
        clientName: data.clientName.trim() || undefined,
        clientEmail: data.clientEmail.trim() || undefined,
        targetCities: data.targetCities,
        locationTypes: data.locationTypes,
        minSurface: data.minSurface,
        maxSurface: data.maxSurface,
        targetAge: (data.targetAge as "jong" | "werkleeftijd" | "any") || undefined,
        minIncome: data.minIncome,
        minPassanten: data.minPassanten,
        competitorKeywords: data.competitorKeywords,
        includeChains: data.includeChains,
        minChainSize: data.minChainSize,
        maxChainSize: data.maxChainSize,
        visibilityPrefs: data.visibilityPrefs ?? [],
        operatingModel: data.operatingModel ?? [],
        excludeIndustrial: data.excludeIndustrial,
        excludeResidential: data.excludeResidential,
        minCityPopulation: data.minCityPopulation,
        positiveEnvironment: data.positiveEnvironment ?? [],
        negativeEnvironment: data.negativeEnvironment ?? [],
      });

      if (!result.success) {
        toast.error(result.error ?? "Profiel aanmaken mislukt");
        setIsSubmitting(false);
        return;
      }

      const profileId = result.data!.id;

      // Start the initial scan
      const scanResult = await startScan(profileId);
      if (scanResult.success) {
        toast.success("Profiel aangemaakt en scan gestart");
      } else {
        toast.success("Profiel aangemaakt");
        toast.error("Scan starten mislukt: " + (scanResult.error ?? "Onbekende fout"));
      }

      router.push(`/dashboard/intelligence/${profileId}`);
    } catch {
      toast.error("Er ging iets mis. Probeer het opnieuw.");
      setIsSubmitting(false);
    }
  }, [data, router]);

  return (
    <ContentCard>
      <ContentCardHeader title={isAgent ? "Zoekprofiel aanmaken voor klant" : isSeeker ? "Zoekprofiel aanmaken" : "Nieuw scanprofiel"} />
      <ContentCardBody className="flex flex-col">
        {/* Progress bar */}
        <StepProgress currentStep={step} />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-2xl">
            {step === 0 && <StepConcept data={data} update={update} isAgent={isAgent} />}
            {step === 1 && <StepLocaties data={data} update={update} />}
            {step === 2 && <StepDoelgroep data={data} update={update} />}
            {step === 3 && <StepInstellingen data={data} update={update} />}
            {step === 4 && <StepReview data={data} onEditStep={setStep} />}
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t border-border px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={step === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" weight="bold" />
              Vorige
            </Button>

            <span className="text-xs text-muted-foreground">
              Stap {step + 1} van {STEPS.length}
            </span>

            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={!canAdvance()}
                className="gap-1.5"
              >
                Volgende
                <ArrowRight className="h-4 w-4" weight="bold" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Bezig...
                  </>
                ) : (
                  <>
                    <Crosshair className="h-4 w-4" weight="bold" />
                    Profiel aanmaken &amp; scan starten
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}

// ---------------------------------------------------------------------------
// Step Progress Indicator
// ---------------------------------------------------------------------------

function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="border-b border-border px-4 py-4 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isComplete = i < currentStep;
            const isCurrent = i === currentStep;

            return (
              <div key={s.key} className="flex items-center gap-2">
                {/* Step indicator */}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                      isComplete &&
                        "border-primary bg-primary text-primary-foreground",
                      isCurrent &&
                        "border-primary bg-primary/10 text-primary",
                      !isComplete &&
                        !isCurrent &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" weight="bold" />
                    ) : (
                      <Icon className="h-4 w-4" weight={isCurrent ? "bold" : "regular"} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "hidden text-sm font-medium sm:inline",
                      isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </div>

                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-2 hidden h-px flex-1 sm:block",
                      i < currentStep ? "bg-primary" : "bg-border",
                    )}
                    style={{ minWidth: 24 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Concept
// ---------------------------------------------------------------------------

interface StepProps {
  data: WizardData;
  update: <K extends keyof WizardData>(field: K, value: WizardData[K]) => void;
}

function StepConcept({ data, update, isAgent }: StepProps & { isAgent: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Wat voor concept wil je openen?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Geef je zoekprofiel een naam en kies het type horecaconcept.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Profielnaam</Label>
          <Input
            id="profile-name"
            placeholder="Bijv. Poké Bowl Amsterdam"
            value={data.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Een herkenbare naam voor dit zoekprofiel.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-type">Concepttype</Label>
          <Select
            value={data.concept}
            onValueChange={(v) => update("concept", v)}
          >
            <SelectTrigger id="concept-type" className="w-full">
              <SelectValue placeholder="Kies een concepttype" />
            </SelectTrigger>
            <SelectContent>
              {CONCEPT_TYPES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-description">
            Beschrijving{" "}
            <span className="font-normal text-muted-foreground">(optioneel)</span>
          </Label>
          <Textarea
            id="concept-description"
            placeholder="Beschrijf je concept, doelgroep, en wat het uniek maakt..."
            value={data.conceptDescription}
            onChange={(e) => update("conceptDescription", e.target.value)}
            className="min-h-[100px] resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Hoe specifieker je bent, hoe beter de scanner kan zoeken.
          </p>
        </div>

        {isAgent && (
          <div className="space-y-4 pt-4 border-t border-border mt-4">
            <p className="text-xs text-muted-foreground">Klant informatie (optioneel)</p>
            <div className="space-y-2">
              <Label htmlFor="client-name">Klant naam</Label>
              <Input
                id="client-name"
                placeholder="Bijv. Lorenzo"
                value={data.clientName}
                onChange={(e) => update("clientName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Klant email</Label>
              <Input
                id="client-email"
                type="email"
                placeholder="client@email.com"
                value={data.clientEmail}
                onChange={(e) => update("clientEmail", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Locaties
// ---------------------------------------------------------------------------

function StepLocaties({ data, update }: StepProps) {
  const [citySearch, setCitySearch] = useState("");

  const toggleCity = useCallback(
    (city: string) => {
      update(
        "targetCities",
        data.targetCities.includes(city)
          ? data.targetCities.filter((c) => c !== city)
          : [...data.targetCities, city],
      );
    },
    [data.targetCities, update],
  );

  const toggleLocationType = useCallback(
    (type: string) => {
      update(
        "locationTypes",
        data.locationTypes.includes(type)
          ? data.locationTypes.filter((t) => t !== type)
          : [...data.locationTypes, type],
      );
    },
    [data.locationTypes, update],
  );

  const filteredCities = DUTCH_CITIES.filter(
    (city) =>
      !POPULAR_CITIES.includes(city as (typeof POPULAR_CITIES)[number]) &&
      city.toLowerCase().includes(citySearch.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Waar wil je zoeken?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecteer de steden en locatietypes waar de scanner moet zoeken.
        </p>
      </div>

      {/* Popular cities */}
      <div className="space-y-3">
        <Label>Populaire steden</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POPULAR_CITIES.map((city) => {
            const isSelected = data.targetCities.includes(city);
            return (
              <button
                key={city}
                type="button"
                onClick={() => toggleCity(city)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                <MapPin
                  className="h-4 w-4 shrink-0"
                  weight={isSelected ? "fill" : "regular"}
                />
                {city}
                {isSelected && (
                  <Check className="ml-auto h-3.5 w-3.5" weight="bold" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Other cities */}
      <div className="space-y-3">
        <Label>Overige steden</Label>
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek stad..."
            value={citySearch}
            onChange={(e) => setCitySearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {filteredCities.map((city) => {
            const isSelected = data.targetCities.includes(city);
            return (
              <label
                key={city}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isSelected ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleCity(city)}
                />
                {city}
              </label>
            );
          })}
        </div>
      </div>

      {/* Selected summary */}
      {data.targetCities.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {data.targetCities.length} stad{data.targetCities.length !== 1 ? "en" : ""} geselecteerd
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {data.targetCities.map((city) => (
              <Badge
                key={city}
                variant="secondary"
                className="cursor-pointer gap-1 pr-1.5"
                onClick={() => toggleCity(city)}
              >
                {city}
                <X className="h-3 w-3" weight="bold" />
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: De eerste 2 steden in de lijst krijgen de hoogste prioriteit bij het scannen.
          </p>
        </div>
      )}

      {/* Location types */}
      <div className="space-y-3">
        <Label>
          Locatietype{" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </Label>
        <div className="space-y-1.5">
          {LOCATION_TYPES.map((loc) => {
            const isSelected = data.locationTypes.includes(loc.value);
            return (
              <label
                key={loc.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isSelected ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleLocationType(loc.value)}
                />
                {loc.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Surface */}
      <div className="space-y-3">
        <Label>
          Oppervlakte (m&sup2;){" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </Label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              type="number"
              placeholder="Min"
              value={data.minSurface ?? ""}
              onChange={(e) =>
                update(
                  "minSurface",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              min={0}
            />
          </div>
          <span className="text-sm text-muted-foreground">tot</span>
          <div className="flex-1">
            <Input
              type="number"
              placeholder="Max"
              value={data.maxSurface ?? ""}
              onChange={(e) =>
                update(
                  "maxSurface",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Visibility preferences */}
      <div className="space-y-3">
        <Label>
          Zichtbaarheidseisen{" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </Label>
        <div className="space-y-1.5">
          {VISIBILITY_OPTIONS.map((opt) => {
            const isChecked = data.visibilityPrefs.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isChecked ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const newPrefs = checked
                      ? [...data.visibilityPrefs, opt.value]
                      : data.visibilityPrefs.filter((p) => p !== opt.value);
                    update("visibilityPrefs", newPrefs);
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Exclusions */}
      <div className="space-y-3">
        <Label>Uitsluitingen</Label>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted">
            <Checkbox
              checked={data.excludeIndustrial}
              onCheckedChange={(checked) =>
                update("excludeIndustrial", checked === true)
              }
            />
            Geen industrieterreinen
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted">
            <Checkbox
              checked={data.excludeResidential}
              onCheckedChange={(checked) =>
                update("excludeResidential", checked === true)
              }
            />
            Geen rustige woonwijken
          </label>
        </div>
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="min-city-pop" className="text-xs text-muted-foreground">
            Minimum inwoneraantal stad{" "}
            <span className="font-normal">(optioneel)</span>
          </Label>
          <Input
            id="min-city-pop"
            type="number"
            placeholder="Bijv. 25000"
            value={data.minCityPopulation ?? ""}
            onChange={(e) =>
              update(
                "minCityPopulation",
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            min={0}
          />
          <p className="text-xs text-muted-foreground">
            Sluit kleinere steden en dorpen uit.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Doelgroep
// ---------------------------------------------------------------------------

function StepDoelgroep({ data, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Wie is je doelgroep?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Help de scanner de juiste buurten en locaties te vinden door je
          doelgroep te beschrijven.
        </p>
      </div>

      {/* Target age */}
      <div className="space-y-3">
        <Label>Leeftijdsgroep</Label>
        <RadioGroup
          value={data.targetAge ?? ""}
          onValueChange={(v) => update("targetAge", v || undefined)}
        >
          {[
            {
              value: "jong",
              label: "Jong (18-30)",
              description: "Studenten, starters, young professionals",
            },
            {
              value: "werkleeftijd",
              label: "Werkleeftijd (25-55)",
              description: "Werkend publiek, gezinnen, zakelijke klanten",
            },
            {
              value: "any",
              label: "Alle leeftijden",
              description: "Breed publiek, geen specifieke voorkeur",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                data.targetAge === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted",
              )}
            >
              <RadioGroupItem
                value={option.value}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {option.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Min income */}
      <div className="space-y-2">
        <Label htmlFor="min-income">
          Minimaal inkomen (x1.000 EUR/jaar){" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </Label>
        <Input
          id="min-income"
          type="number"
          placeholder="Bijv. 35"
          value={data.minIncome ?? ""}
          onChange={(e) =>
            update(
              "minIncome",
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
          min={0}
        />
        <p className="text-xs text-muted-foreground">
          Gemiddeld huishoudinkomen in de buurt, in duizenden euro per jaar.
        </p>
      </div>

      {/* Min passanten */}
      <div className="space-y-2">
        <Label htmlFor="min-passanten">
          Minimaal passanten per dag{" "}
          <span className="font-normal text-muted-foreground">(optioneel)</span>
        </Label>
        <Input
          id="min-passanten"
          type="number"
          placeholder="Bijv. 5000"
          value={data.minPassanten ?? ""}
          onChange={(e) =>
            update(
              "minPassanten",
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
          min={0}
        />
        <p className="text-xs text-muted-foreground">
          Geschat voetgangersverkeer op de locatie per dag.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Scan Instellingen
// ---------------------------------------------------------------------------

function StepInstellingen({ data, update }: StepProps) {
  const [keywordInput, setKeywordInput] = useState("");
  const [positiveEnvInput, setPositiveEnvInput] = useState("");
  const [negativeEnvInput, setNegativeEnvInput] = useState("");

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim();
    if (
      trimmed &&
      !data.competitorKeywords.includes(trimmed) &&
      data.competitorKeywords.length < 30
    ) {
      update("competitorKeywords", [...data.competitorKeywords, trimmed]);
      setKeywordInput("");
    }
  }, [keywordInput, data.competitorKeywords, update]);

  const removeKeyword = useCallback(
    (keyword: string) => {
      update(
        "competitorKeywords",
        data.competitorKeywords.filter((k) => k !== keyword),
      );
    },
    [data.competitorKeywords, update],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addKeyword();
      }
    },
    [addKeyword],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Scan instellingen
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configureer welke concurrenten en ketens de scanner moet herkennen.
        </p>
      </div>

      {/* Competitor keywords */}
      <div className="space-y-3">
        <Label htmlFor="keyword-input">Concurrent-keywords</Label>
        <div className="flex items-center gap-2">
          <Input
            id="keyword-input"
            placeholder="Typ een keyword en druk op Enter..."
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addKeyword}
            disabled={!keywordInput.trim()}
            type="button"
          >
            Toevoegen
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Voeg zoektermen toe die concurrenten beschrijven. Bijv. &quot;poke
          bowl&quot;, &quot;sushi bar&quot;, &quot;healthy food&quot;.
        </p>

        {data.competitorKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.competitorKeywords.map((kw) => (
              <Badge
                key={kw}
                variant="secondary"
                className="cursor-pointer gap-1 pr-1.5"
                onClick={() => removeKeyword(kw)}
              >
                {kw}
                <X className="h-3 w-3" weight="bold" />
              </Badge>
            ))}
          </div>
        )}

        {data.competitorKeywords.length === 0 && (
          <p className="text-xs text-muted-foreground/70">
            Nog geen keywords toegevoegd. Voeg minimaal 1 keyword toe.
          </p>
        )}
      </div>

      {/* Include chains */}
      <div className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted">
          <Checkbox
            checked={data.includeChains}
            onCheckedChange={(checked) =>
              update("includeChains", checked === true)
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              Ketens meenemen in analyse
            </p>
            <p className="text-xs text-muted-foreground">
              Neem ook horecaketens mee als concurrenten in de omgeving.
            </p>
          </div>
        </label>

        {/* Chain size inputs */}
        {data.includeChains && (
          <div className="ml-7 space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
            <Label className="text-xs text-muted-foreground">
              Ketengrootte (aantal vestigingen)
            </Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Min"
                  value={data.minChainSize ?? ""}
                  onChange={(e) =>
                    update(
                      "minChainSize",
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  min={1}
                />
              </div>
              <span className="text-sm text-muted-foreground">tot</span>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Max"
                  value={data.maxChainSize ?? ""}
                  onChange={(e) =>
                    update(
                      "maxChainSize",
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  min={1}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Laat leeg om alle ketengroottes mee te nemen.
            </p>
          </div>
        )}
      </div>

      {/* Operating model */}
      <div className="space-y-3">
        <Label>Bedieningsmodel</Label>
        <div className="space-y-1.5">
          {OPERATING_MODEL_OPTIONS.map((opt) => {
            const isChecked = data.operatingModel.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isChecked ? "bg-primary/5 text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const newModel = checked
                      ? [...data.operatingModel, opt.value]
                      : data.operatingModel.filter((m) => m !== opt.value);
                    update("operatingModel", newModel);
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Op welke manier bedien je klanten? Selecteer alle toepasselijke opties.
        </p>
      </div>

      {/* Positive environment */}
      <div className="space-y-3">
        <Label className="text-emerald-600">Positieve omgeving</Label>
        <p className="text-xs text-muted-foreground">
          Welke horeca in de buurt is goed? (meer voetverkeer)
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Typ en druk op Enter..."
            value={positiveEnvInput}
            onChange={(e) => setPositiveEnvInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = positiveEnvInput.trim();
                if (trimmed && !data.positiveEnvironment.includes(trimmed)) {
                  update("positiveEnvironment", [...data.positiveEnvironment, trimmed]);
                  setPositiveEnvInput("");
                }
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!positiveEnvInput.trim()}
            onClick={() => {
              const trimmed = positiveEnvInput.trim();
              if (trimmed && !data.positiveEnvironment.includes(trimmed)) {
                update("positiveEnvironment", [...data.positiveEnvironment, trimmed]);
                setPositiveEnvInput("");
              }
            }}
          >
            Toevoegen
          </Button>
        </div>
        {data.positiveEnvironment.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.positiveEnvironment.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer gap-1 pr-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400"
                onClick={() =>
                  update("positiveEnvironment", data.positiveEnvironment.filter((t) => t !== tag))
                }
              >
                {tag}
                <X className="h-3 w-3" weight="bold" />
              </Badge>
            ))}
          </div>
        )}
        {data.positiveEnvironment.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ENVIRONMENT_SUGGESTIONS.positive.map((suggestion) => (
              <Badge
                key={suggestion}
                variant="outline"
                className="cursor-pointer text-xs text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                onClick={() =>
                  update("positiveEnvironment", [...data.positiveEnvironment, suggestion])
                }
              >
                + {suggestion}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Negative environment */}
      <div className="space-y-3">
        <Label className="text-destructive">Negatieve omgeving</Label>
        <p className="text-xs text-muted-foreground">
          Welke horeca in de buurt is ongewenst? (directe concurrentie)
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Typ en druk op Enter..."
            value={negativeEnvInput}
            onChange={(e) => setNegativeEnvInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = negativeEnvInput.trim();
                if (trimmed && !data.negativeEnvironment.includes(trimmed)) {
                  update("negativeEnvironment", [...data.negativeEnvironment, trimmed]);
                  setNegativeEnvInput("");
                }
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!negativeEnvInput.trim()}
            onClick={() => {
              const trimmed = negativeEnvInput.trim();
              if (trimmed && !data.negativeEnvironment.includes(trimmed)) {
                update("negativeEnvironment", [...data.negativeEnvironment, trimmed]);
                setNegativeEnvInput("");
              }
            }}
          >
            Toevoegen
          </Button>
        </div>
        {data.negativeEnvironment.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.negativeEnvironment.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer gap-1 pr-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-400"
                onClick={() =>
                  update("negativeEnvironment", data.negativeEnvironment.filter((t) => t !== tag))
                }
              >
                {tag}
                <X className="h-3 w-3" weight="bold" />
              </Badge>
            ))}
          </div>
        )}
        {data.negativeEnvironment.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ENVIRONMENT_SUGGESTIONS.negative.map((suggestion) => (
              <Badge
                key={suggestion}
                variant="outline"
                className="cursor-pointer text-xs text-muted-foreground hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                onClick={() =>
                  update("negativeEnvironment", [...data.negativeEnvironment, suggestion])
                }
              >
                + {suggestion}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Review & Start
// ---------------------------------------------------------------------------

function StepReview({
  data,
  onEditStep,
}: {
  data: WizardData;
  onEditStep: (step: number) => void;
}) {
  const conceptLabel =
    CONCEPT_TYPES.find((c) => c.value === data.concept)?.label ?? data.concept;

  const ageLabels: Record<string, string> = {
    jong: "Jong (18-30)",
    werkleeftijd: "Werkleeftijd (25-55)",
    any: "Alle leeftijden",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Overzicht scanprofiel
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controleer je instellingen voordat de scan wordt gestart.
        </p>
      </div>

      {/* Section: Concept */}
      <ReviewSection title="Concept" onEdit={() => onEditStep(0)}>
        <ReviewRow label="Profielnaam" value={data.name} />
        <ReviewRow label="Concepttype" value={conceptLabel} />
        {data.conceptDescription && (
          <ReviewRow label="Beschrijving" value={data.conceptDescription} />
        )}
        {data.clientName && (
          <ReviewRow label="Klant naam" value={data.clientName} />
        )}
        {data.clientEmail && (
          <ReviewRow label="Klant email" value={data.clientEmail} />
        )}
      </ReviewSection>

      {/* Section: Locaties */}
      <ReviewSection title="Locaties" onEdit={() => onEditStep(1)}>
        <ReviewRow
          label="Steden"
          value={
            <div className="flex flex-wrap gap-1">
              {data.targetCities.map((city) => (
                <Badge key={city} variant="secondary" className="text-xs">
                  {city}
                </Badge>
              ))}
            </div>
          }
        />
        {data.locationTypes.length > 0 && (
          <ReviewRow
            label="Locatietypes"
            value={
              <div className="flex flex-wrap gap-1">
                {data.locationTypes.map((lt) => {
                  const loc = LOCATION_TYPES.find((l) => l.value === lt);
                  return (
                    <Badge key={lt} variant="secondary" className="text-xs">
                      {loc?.label ?? lt}
                    </Badge>
                  );
                })}
              </div>
            }
          />
        )}
        {(data.minSurface || data.maxSurface) && (
          <ReviewRow
            label="Oppervlakte"
            value={`${data.minSurface ?? "0"} - ${data.maxSurface ?? "\u221E"} m\u00B2`}
          />
        )}
      </ReviewSection>

      {/* Section: Doelgroep */}
      <ReviewSection title="Doelgroep" onEdit={() => onEditStep(2)}>
        <ReviewRow
          label="Leeftijdsgroep"
          value={
            data.targetAge ? ageLabels[data.targetAge] ?? data.targetAge : "Niet opgegeven"
          }
        />
        <ReviewRow
          label="Min. inkomen"
          value={
            data.minIncome
              ? `\u20AC ${data.minIncome.toLocaleString("nl-NL")}k/jaar`
              : "Niet opgegeven"
          }
        />
        <ReviewRow
          label="Min. passanten"
          value={
            data.minPassanten
              ? `${data.minPassanten.toLocaleString("nl-NL")}/dag`
              : "Niet opgegeven"
          }
        />
      </ReviewSection>

      {/* Section: Scan Instellingen */}
      <ReviewSection title="Scan instellingen" onEdit={() => onEditStep(3)}>
        <ReviewRow
          label="Keywords"
          value={
            <div className="flex flex-wrap gap-1">
              {data.competitorKeywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
          }
        />
        <ReviewRow
          label="Ketens"
          value={data.includeChains ? "Ja" : "Nee"}
        />
        {data.includeChains &&
          (data.minChainSize || data.maxChainSize) && (
            <ReviewRow
              label="Ketengrootte"
              value={`${data.minChainSize ?? "1"} - ${data.maxChainSize ?? "\u221E"} vestigingen`}
            />
          )}
      </ReviewSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review helpers
// ---------------------------------------------------------------------------

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          Wijzigen
        </Button>
      </div>
      <div className="divide-y divide-border/40 px-4">{children}</div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="text-right text-sm text-foreground">
        {typeof value === "string" ? (
          <span className="max-w-xs truncate">{value}</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

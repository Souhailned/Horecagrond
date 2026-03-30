/**
 * Signal Detector — Overname Intelligence Scanner
 *
 * Analyseert horeca-bedrijven op "overname-signalen": tekenen dat een zaak
 * mogelijk beschikbaar komt voor acquisitie. Denk aan dalende ratings,
 * verminderde activiteit, sluitingen, etc.
 *
 * ALLE functies in dit bestand zijn PURE FUNCTIONS:
 * - Geen database-aanroepen
 * - Geen AI/API-calls
 * - Geen side-effects
 * - Volledig testbaar met mock data
 */

// ---------------------------------------------------------------------------
// Types — lokaal gedefinieerd om puurheid te garanderen
// ---------------------------------------------------------------------------

export interface MonitoredBusinessData {
  currentRating: number | null;
  totalReviews: number | null;
  priceLevel: number | null;
  isOpen: boolean;
  openingHours: unknown; // JSON
  chainSize: number | null;
  tripadvisorRating: number | null;
  tripadvisorReviews: number | null;
  lastScannedAt: Date;

  // Crawled data (optioneel, doorgegeven vanuit CrawledBusinessIntel)
  newsHasOvernameSignal?: boolean;
  thuisbezorgdRating?: number | null;
  kvkIsKeten?: boolean;
  kvkKetenGrootte?: number;
}

export interface BusinessSnapshotData {
  rating: number | null;
  reviewCount: number | null;
  recentReviews: unknown; // JSON array
  isOpen: boolean;
  tripadvisorRating: number | null;
  tripadvisorReviews: number | null;
  scannedAt: Date;
}

export interface SignalAnalysis {
  /** Totale signaal-score van 0 (geen signalen) tot 100 (sterk overname-signaal) */
  signalScore: number;
  /** Individuele signaal-vlaggen */
  signals: {
    /** Rating gedaald met meer dan 0.3 in afgelopen maand */
    ratingDrop: boolean;
    /** Hoeveelheid rating-daling (indien van toepassing) */
    ratingDropAmount?: number;
    /** Minder reviews dan verwacht op basis van historisch patroon */
    reviewDecline: boolean;
    /** Recente reviews zijn overwegend negatief */
    negativeSentiment: boolean;
    /** Google meldt permanent gesloten */
    recentlyClosed: boolean;
    /** Tijdelijk gesloten */
    temporarilyClosed: boolean;
    /** Eigenaar heeft meerdere locaties (keten) */
    ownerMultipleLocations: boolean;
    /** Rating onder 3.5 */
    lowRating: boolean;
    /** Minder dan 20 reviews — beperkte naamsbekendheid */
    fewReviews: boolean;
    /** Geen nieuwe reviews in 3+ maanden */
    stalePresence: boolean;
    /** Minder openingstijden dan gebruikelijk */
    reducedHours: boolean;
    /** Prijsniveau past niet bij de omgeving */
    priceMismatch: boolean;
    /** Bedrijf staat te koop op horeca marktplaats of in nieuwsberichten */
    listedForSale: boolean;
    /** Thuisbezorgd delivery rating onder 6.0 (schaal 0-10) */
    deliveryRatingLow: boolean;
    /** Nieuwsartikelen bevatten overname/verkoop signalen */
    newsOvernameSignal: boolean;
    /** Eigenaar heeft meerdere vestigingen met dalende ratings */
    ketenWithIssues: boolean;
  };
  /** Belangrijkste signaal in het Nederlands */
  topSignal: string;
  /** Alle signaal-omschrijvingen in het Nederlands */
  signalDetails: string[];
}

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

/** Minimale rating-daling die als signaal geldt */
const RATING_DROP_THRESHOLD = 0.3;

/** Sterke rating-daling drempel */
const RATING_DROP_STRONG_THRESHOLD = 0.5;

/** Rating onder deze waarde is een signaal */
const LOW_RATING_THRESHOLD = 3.5;

/** Minder dan dit aantal reviews geldt als "weinig" */
const FEW_REVIEWS_THRESHOLD = 20;

/** Aantal maanden zonder reviews voor "stale" signaal */
const STALE_MONTHS = 3;

/** Thuisbezorgd rating onder deze waarde is een signaal (schaal 0-10) */
const DELIVERY_RATING_LOW_THRESHOLD = 6.0;

/** Verwacht aantal openingsdagen per week voor horeca */
const TYPICAL_OPENING_DAYS = 6;

/** Minimaal verwachte uren per dag */
const TYPICAL_HOURS_PER_DAY = 8;

/** Signaal-score gewichten */
const WEIGHTS = {
  permanentlyClosed: 40,
  listedForSale: 35,
  temporarilyClosed: 30,
  veryLowRating: 25,
  newsOvernameSignal: 25,
  strongRatingDrop: 20,
  ratingDrop: 15,
  negativeSentiment: 15,
  ketenWithIssues: 12,
  fewReviews: 10,
  stalePresence: 10,
  reducedHours: 10,
  reviewDecline: 8,
  deliveryRatingLow: 8,
  priceMismatch: 5,
} as const;

// ---------------------------------------------------------------------------
// Sub-detectors
// ---------------------------------------------------------------------------

/**
 * Detecteert een daling in de Google-rating over recente snapshots.
 *
 * Vergelijkt de meest recente snapshot met de oudste die binnen 30 dagen
 * valt. Een daling van meer dan 0.3 punt wordt als signaal gezien.
 *
 * @param snapshots - Chronologisch gesorteerde snapshots (oudste eerst)
 * @returns Of er een daling is gedetecteerd en de hoeveelheid
 */
export function detectRatingDrop(
  snapshots: BusinessSnapshotData[]
): { detected: boolean; amount: number } {
  if (snapshots.length < 2) {
    return { detected: false, amount: 0 };
  }

  // Sorteer op datum (oudste eerst) voor consistentie
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime()
  );

  // Filter snapshots met een geldige rating
  const withRating = sorted.filter(
    (s): s is BusinessSnapshotData & { rating: number } => s.rating != null
  );

  if (withRating.length < 2) {
    return { detected: false, amount: 0 };
  }

  const latest = withRating[withRating.length - 1];
  const latestDate = new Date(latest.scannedAt);

  // Zoek de oudste snapshot binnen de afgelopen 30 dagen
  const thirtyDaysAgo = new Date(latestDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Pak de oudste snapshot met rating die tenminste een dag ouder is dan de laatste
  const olderSnapshots = withRating.filter((s) => {
    const date = new Date(s.scannedAt);
    return date < latestDate && date >= thirtyDaysAgo;
  });

  if (olderSnapshots.length === 0) {
    // Geen vergelijkingspunt binnen 30 dagen — gebruik oudste beschikbare
    const oldest = withRating[0];
    if (oldest === latest) {
      return { detected: false, amount: 0 };
    }
    const amount = oldest.rating - latest.rating;
    return {
      detected: amount > RATING_DROP_THRESHOLD,
      amount: Math.round(amount * 100) / 100,
    };
  }

  const reference = olderSnapshots[0]; // oudste binnen 30 dagen
  const amount = reference.rating - latest.rating;

  return {
    detected: amount > RATING_DROP_THRESHOLD,
    amount: Math.round(amount * 100) / 100,
  };
}

/**
 * Detecteert een dalende trend in het aantal reviews.
 *
 * Vergelijkt de groeisnelheid van reviews in recente periodes.
 * Als de meest recente periode significant minder groei laat zien
 * dan de eerdere periode, is dit een signaal.
 *
 * @param snapshots - Snapshots van het bedrijf
 * @returns Of er een reviewdaling is gedetecteerd
 */
export function detectReviewDecline(
  snapshots: BusinessSnapshotData[]
): boolean {
  if (snapshots.length < 3) {
    return false;
  }

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime()
  );

  const withReviews = sorted.filter(
    (s): s is BusinessSnapshotData & { reviewCount: number } =>
      s.reviewCount != null
  );

  if (withReviews.length < 3) {
    return false;
  }

  // Splits in twee helften en vergelijk groeisnelheid
  const midpoint = Math.floor(withReviews.length / 2);
  const firstHalf = withReviews.slice(0, midpoint + 1);
  const secondHalf = withReviews.slice(midpoint);

  const firstGrowth = calculateReviewGrowthRate(firstHalf);
  const secondGrowth = calculateReviewGrowthRate(secondHalf);

  // Als eerste helft groei had maar tweede helft significant minder,
  // dan is er een dalende trend
  if (firstGrowth <= 0) {
    return false; // Geen referentiepunt als er al geen groei was
  }

  // Tweede helft groeit minder dan 50% van de eerste helft
  return secondGrowth < firstGrowth * 0.5;
}

/**
 * Detecteert of een bedrijf "stale" is — geen nieuwe activiteit in 3+ maanden.
 *
 * Controleert de datum van de laatste snapshot met reviews en de
 * lastScannedAt van het bedrijf.
 *
 * @param business - Huidige bedrijfsgegevens
 * @param snapshots - Historische snapshots
 * @returns Of het bedrijf als "stale" wordt beschouwd
 */
export function detectStaleness(
  business: MonitoredBusinessData,
  snapshots: BusinessSnapshotData[]
): boolean {
  if (snapshots.length === 0) {
    // Geen snapshots beschikbaar — controleer lastScannedAt
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - STALE_MONTHS);
    return new Date(business.lastScannedAt) < monthsAgo;
  }

  // Zoek de meest recente snapshot die daadwerkelijk review-activiteit toont
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
  );

  // Controleer of er recentelijk reviews zijn geplaatst
  const latestWithReviews = sorted.find((s) => {
    if (!s.recentReviews || !Array.isArray(s.recentReviews)) {
      return false;
    }
    return (s.recentReviews as unknown[]).length > 0;
  });

  if (!latestWithReviews) {
    // Geen snapshot met reviews gevonden — val terug op reviewCount-groei
    const withCounts = sorted.filter((s) => s.reviewCount != null);
    if (withCounts.length < 2) {
      // Kan geen groei meten — val terug op lastScannedAt
      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - STALE_MONTHS);
      return new Date(business.lastScannedAt) < monthsAgo;
    }

    // Controleer of reviewCount is gestegen in de laatste 3 maanden
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - STALE_MONTHS);

    const recentSnapshots = withCounts.filter(
      (s) => new Date(s.scannedAt) >= threeMonthsAgo
    );

    if (recentSnapshots.length < 2) {
      return true; // Niet genoeg recente data
    }

    const newest = recentSnapshots[0];
    const oldest = recentSnapshots[recentSnapshots.length - 1];

    return (newest.reviewCount ?? 0) <= (oldest.reviewCount ?? 0);
  }

  const latestDate = new Date(latestWithReviews.scannedAt);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - STALE_MONTHS);

  return latestDate < threeMonthsAgo;
}

/**
 * Detecteert of het bedrijf een lage rating heeft (< 3.5).
 *
 * @param business - Huidige bedrijfsgegevens
 * @returns Of de rating onder de drempel valt
 */
export function detectLowRating(business: MonitoredBusinessData): boolean {
  if (business.currentRating == null) {
    return false;
  }
  return business.currentRating < LOW_RATING_THRESHOLD;
}

/**
 * Detecteert of het bedrijf weinig reviews heeft (< 20).
 *
 * Weinig reviews duidt op beperkte naamsbekendheid, wat een
 * kans kan zijn voor een overname met rebranding.
 *
 * @param business - Huidige bedrijfsgegevens
 * @returns Of het aantal reviews onder de drempel valt
 */
export function detectFewReviews(business: MonitoredBusinessData): boolean {
  if (business.totalReviews == null) {
    return true; // Geen reviews-data beschikbaar = weinig zichtbaarheid
  }
  return business.totalReviews < FEW_REVIEWS_THRESHOLD;
}

/**
 * Detecteert of het bedrijf permanent of tijdelijk gesloten is.
 *
 * Controleert de isOpen-status van het bedrijf en recente snapshots.
 *
 * @param business - Huidige bedrijfsgegevens
 * @returns Status van permanente en tijdelijke sluiting
 */
export function detectClosedStatus(business: MonitoredBusinessData): {
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
} {
  if (business.isOpen) {
    return { permanentlyClosed: false, temporarilyClosed: false };
  }

  // Als het bedrijf niet open is, bepaal of het permanent of tijdelijk is.
  // Heuristiek: als er nog openingstijden zijn, is het waarschijnlijk tijdelijk.
  const hasOpeningHours =
    business.openingHours != null &&
    typeof business.openingHours === "object" &&
    !isEmptyObject(business.openingHours);

  if (hasOpeningHours) {
    return { permanentlyClosed: false, temporarilyClosed: true };
  }

  return { permanentlyClosed: true, temporarilyClosed: false };
}

/**
 * Detecteert of het bedrijf verminderde openingstijden heeft.
 *
 * Vergelijkt het aantal openingsdagen en -uren met wat typisch is
 * voor een horecazaak (6 dagen per week, 8+ uur per dag).
 *
 * @param business - Huidige bedrijfsgegevens
 * @returns Of de openingstijden als "verminderd" worden beschouwd
 */
export function detectReducedHours(business: MonitoredBusinessData): boolean {
  if (!business.openingHours || !business.isOpen) {
    return false;
  }

  const hours = business.openingHours;

  // Google Places openingHours format: { periods: [{ open: { day, time }, close: { day, time } }] }
  // of simpelweg: { weekday_text: ["Monday: 9:00 AM - 10:00 PM", ...] }
  if (typeof hours !== "object" || hours === null) {
    return false;
  }

  const hoursObj = hours as Record<string, unknown>;

  // Probeer het periods-formaat
  if (Array.isArray(hoursObj.periods)) {
    const periods = hoursObj.periods as Array<{
      open?: { day?: number; time?: string };
      close?: { day?: number; time?: string };
    }>;

    if (periods.length === 0) {
      return true; // Geen periodes = gesloten
    }

    // Tel het aantal unieke openingsdagen
    const openDays = new Set(
      periods
        .map((p) => p.open?.day)
        .filter((d): d is number => d != null)
    );

    if (openDays.size < TYPICAL_OPENING_DAYS - 2) {
      // 4 of minder dagen open (2+ minder dan typisch)
      return true;
    }

    // Controleer gemiddelde dagduur
    const totalHours = periods.reduce((sum, period) => {
      const openTime = parseTimeToMinutes(period.open?.time);
      const closeTime = parseTimeToMinutes(period.close?.time);
      if (openTime == null || closeTime == null) return sum;
      const duration = closeTime > openTime
        ? closeTime - openTime
        : (24 * 60 - openTime) + closeTime;
      return sum + duration / 60;
    }, 0);

    const avgHoursPerDay =
      openDays.size > 0 ? totalHours / openDays.size : 0;

    return avgHoursPerDay < TYPICAL_HOURS_PER_DAY - 2; // Minder dan 6 uur
  }

  // Probeer het weekday_text-formaat
  if (Array.isArray(hoursObj.weekday_text)) {
    const texts = hoursObj.weekday_text as string[];
    const closedDays = texts.filter(
      (t) =>
        typeof t === "string" &&
        (t.toLowerCase().includes("closed") ||
          t.toLowerCase().includes("gesloten"))
    ).length;

    // Als 3+ dagen gesloten, is dat verminderd
    return closedDays >= 3;
  }

  return false;
}

/**
 * Detecteert of het prijsniveau niet past bij de locatie.
 *
 * Een simpele heuristiek: als het bedrijf een laag prijsniveau (1) heeft
 * maar een lage rating, of een hoog prijsniveau (4) met weinig reviews,
 * kan dit duiden op een mismatch.
 *
 * @param business - Huidige bedrijfsgegevens
 * @returns Of er een prijs-mismatch is gedetecteerd
 */
export function detectPriceMismatch(business: MonitoredBusinessData): boolean {
  if (business.priceLevel == null || business.currentRating == null) {
    return false;
  }

  // Hoog prijsniveau maar lage rating — klanten krijgen niet waar ze voor betalen
  if (business.priceLevel >= 3 && business.currentRating < 3.0) {
    return true;
  }

  // Hoog prijsniveau met heel weinig reviews — mogelijk niet genoeg klanten
  if (
    business.priceLevel >= 3 &&
    business.totalReviews != null &&
    business.totalReviews < 10
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Crawled data detectoren
// ---------------------------------------------------------------------------

/**
 * Detecteert of een bedrijf te koop staat op basis van crawled nieuwsdata.
 *
 * Controleert het `hasOvernameSignal` veld uit de gecrawlde nieuws-data,
 * wat aangeeft dat het bedrijf actief te koop is aangeboden op een
 * horeca marktplaats of in nieuwsartikelen.
 *
 * @param newsData - Gecrawlde nieuws-data (JSON van CrawledBusinessIntel.newsData)
 * @returns Of er een "te koop" signaal is gevonden
 */
export function detectListedForSale(newsData: unknown): boolean {
  if (newsData == null || typeof newsData !== "object") {
    return false;
  }

  const news = newsData as Record<string, unknown>;
  return news.hasOvernameSignal === true;
}

/**
 * Detecteert of een bedrijf een lage delivery rating heeft op Thuisbezorgd.
 *
 * Thuisbezorgd ratings zijn op een schaal van 0-10. Een rating onder 6.0
 * duidt op structurele kwaliteitsproblemen in de bezorgservice.
 *
 * @param thuisbezorgdData - Gecrawlde Thuisbezorgd-data (JSON van CrawledBusinessIntel.thuisbezorgdData)
 * @returns Of de delivery rating onder de drempelwaarde valt
 */
export function detectDeliveryIssues(thuisbezorgdData: unknown): boolean {
  if (thuisbezorgdData == null || typeof thuisbezorgdData !== "object") {
    return false;
  }

  const tb = thuisbezorgdData as Record<string, unknown>;
  const rating = tb.rating;

  if (typeof rating !== "number" || isNaN(rating)) {
    return false;
  }

  return rating < DELIVERY_RATING_LOW_THRESHOLD;
}

/**
 * Detecteert of een keten-eigenaar problemen heeft met meerdere vestigingen.
 *
 * Een eigenaar met meerdere locaties (keten) die tegelijk een lage rating
 * heeft, kan bereid zijn om een of meer vestigingen af te stoten.
 *
 * @param kvkData - Gecrawlde KvK-data (JSON van CrawledBusinessIntel.kvkData)
 * @param business - Huidige bedrijfsgegevens
 * @returns Of de keten tekenen van problemen vertoont
 */
export function detectKetenIssues(
  kvkData: unknown,
  business: MonitoredBusinessData
): boolean {
  if (kvkData == null || typeof kvkData !== "object") {
    // Fallback op MonitoredBusinessData velden indien beschikbaar
    if (business.kvkIsKeten && business.kvkKetenGrootte != null && business.kvkKetenGrootte > 1) {
      return business.currentRating != null && business.currentRating < LOW_RATING_THRESHOLD;
    }
    return false;
  }

  const kvk = kvkData as Record<string, unknown>;
  const isKeten = kvk.isKeten === true;
  const ketenGrootte = typeof kvk.ketenGrootte === "number" ? kvk.ketenGrootte : 0;

  if (!isKeten || ketenGrootte <= 1) {
    return false;
  }

  return business.currentRating != null && business.currentRating < LOW_RATING_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Negatief sentiment detectie
// ---------------------------------------------------------------------------

/**
 * Detecteert negatief sentiment in recente reviews.
 *
 * Analyseert de meest recente snapshot voor reviews met een lage
 * rating of een expliciet negatief sentiment-label.
 *
 * @param snapshots - Historische snapshots
 * @returns Of er overwegend negatief sentiment is gedetecteerd
 */
export function detectNegativeSentiment(
  snapshots: BusinessSnapshotData[]
): boolean {
  if (snapshots.length === 0) {
    return false;
  }

  // Pak de meest recente snapshot met reviews
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
  );

  const latestWithReviews = sorted.find(
    (s) => s.recentReviews != null && Array.isArray(s.recentReviews)
  );

  if (!latestWithReviews) {
    return false;
  }

  const reviews = latestWithReviews.recentReviews as Array<{
    rating?: number;
    sentiment?: string;
  }>;

  if (reviews.length === 0) {
    return false;
  }

  // Tel negatieve reviews (rating <= 2 of sentiment "negative")
  const negativeCount = reviews.filter((r) => {
    if (r.sentiment?.toLowerCase() === "negative") return true;
    if (r.rating != null && r.rating <= 2) return true;
    return false;
  }).length;

  // Meer dan 40% negatief is een signaal
  return negativeCount / reviews.length > 0.4;
}

// ---------------------------------------------------------------------------
// Score Calculator
// ---------------------------------------------------------------------------

/**
 * Berekent de totale signaal-score op basis van actieve signalen.
 *
 * De score is een som van gewichten per signaal, begrensd op 100.
 *
 * Gewichten:
 * - Permanent gesloten:     +40
 * - Te koop aangeboden:     +35
 * - Tijdelijk gesloten:     +30
 * - Rating < 3.0:           +25
 * - Overname in nieuws:     +25
 * - Rating daling > 0.5:    +20
 * - Rating daling > 0.3:    +15
 * - Negatief sentiment:     +15
 * - Keten met problemen:    +12
 * - Weinig reviews:         +10
 * - Geen activiteit 3+ mnd: +10
 * - Verminderde uren:       +10
 * - Dalende reviews:        +8
 * - Lage delivery rating:   +8
 * - Prijs-mismatch:         +5
 *
 * @param signals - Gedetecteerde signalen
 * @returns Score van 0 tot 100
 */
export function calculateSignalScore(
  signals: SignalAnalysis["signals"]
): number {
  let score = 0;

  if (signals.recentlyClosed) {
    score += WEIGHTS.permanentlyClosed;
  }

  if (signals.temporarilyClosed) {
    score += WEIGHTS.temporarilyClosed;
  }

  // Lage rating: extra zwaar als < 3.0
  if (signals.lowRating) {
    // Gebruik de ratingDropAmount niet — lowRating is op basis van absolute waarde
    score += WEIGHTS.veryLowRating;
  }

  // Rating daling: sterkere daling = zwaarder gewicht
  if (signals.ratingDrop) {
    const dropAmount = signals.ratingDropAmount ?? 0;
    if (dropAmount > RATING_DROP_STRONG_THRESHOLD) {
      score += WEIGHTS.strongRatingDrop;
    } else {
      score += WEIGHTS.ratingDrop;
    }
  }

  if (signals.negativeSentiment) {
    score += WEIGHTS.negativeSentiment;
  }

  if (signals.fewReviews) {
    score += WEIGHTS.fewReviews;
  }

  if (signals.stalePresence) {
    score += WEIGHTS.stalePresence;
  }

  if (signals.reducedHours) {
    score += WEIGHTS.reducedHours;
  }

  if (signals.reviewDecline) {
    score += WEIGHTS.reviewDecline;
  }

  if (signals.priceMismatch) {
    score += WEIGHTS.priceMismatch;
  }

  // Crawled data signalen
  if (signals.listedForSale) {
    score += WEIGHTS.listedForSale;
  }

  if (signals.newsOvernameSignal) {
    score += WEIGHTS.newsOvernameSignal;
  }

  if (signals.deliveryRatingLow) {
    score += WEIGHTS.deliveryRatingLow;
  }

  if (signals.ketenWithIssues) {
    score += WEIGHTS.ketenWithIssues;
  }

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Top Signal & Details (Nederlandse teksten)
// ---------------------------------------------------------------------------

/**
 * Genereert het belangrijkste signaal als Nederlandse tekst.
 *
 * Signalen worden in volgorde van ernst gerangschikt. Het eerste
 * actieve signaal wordt als "top signaal" teruggegeven.
 */
function getTopSignal(
  signals: SignalAnalysis["signals"],
  business: MonitoredBusinessData
): string {
  if (signals.recentlyClosed) {
    return "Permanent gesloten — locatie potentieel beschikbaar";
  }

  if (signals.temporarilyClosed) {
    return "Tijdelijk gesloten — mogelijke transitie";
  }

  if (signals.listedForSale) {
    return "Actief te koop aangeboden op horeca marktplaats";
  }

  if (signals.newsOvernameSignal) {
    return "Overname signaal in horeca nieuws";
  }

  if (signals.ratingDrop && signals.ratingDropAmount != null) {
    const currentRating = business.currentRating ?? 0;
    const previousRating = currentRating + signals.ratingDropAmount;
    return `Rating sterk gedaald (van ${previousRating.toFixed(1)} naar ${currentRating.toFixed(1)})`;
  }

  if (signals.lowRating) {
    const rating = business.currentRating ?? 0;
    if (business.totalReviews != null && business.totalReviews >= FEW_REVIEWS_THRESHOLD) {
      return `Lage waardering (${rating.toFixed(1)}) ondanks veel reviews`;
    }
    return `Lage waardering (${rating.toFixed(1)})`;
  }

  if (signals.negativeSentiment) {
    return "Overwegend negatieve recente reviews";
  }

  if (signals.fewReviews) {
    return "Weinig reviews — beperkte naamsbekendheid";
  }

  if (signals.stalePresence) {
    return "Geen nieuwe activiteit in 3+ maanden";
  }

  if (signals.reducedHours) {
    return "Beperkte openingstijden";
  }

  if (signals.reviewDecline) {
    return "Dalende reviewfrequentie";
  }

  if (signals.ketenWithIssues) {
    return "Keten met meerdere vestigingen toont problemen";
  }

  if (signals.priceMismatch) {
    return "Prijsniveau past niet bij kwaliteit";
  }

  if (signals.deliveryRatingLow) {
    return "Lage delivery rating op Thuisbezorgd";
  }

  return "Geen significante signalen gedetecteerd";
}

/**
 * Genereert alle signaal-omschrijvingen in het Nederlands.
 */
function getSignalDetails(
  signals: SignalAnalysis["signals"],
  business: MonitoredBusinessData
): string[] {
  const details: string[] = [];

  if (signals.recentlyClosed) {
    details.push("Permanent gesloten volgens Google — locatie potentieel beschikbaar voor overname");
  }

  if (signals.temporarilyClosed) {
    details.push("Tijdelijk gesloten — kan duiden op verbouwing, seizoensluiting, of overgangsfase");
  }

  if (signals.ratingDrop) {
    const amount = signals.ratingDropAmount ?? 0;
    const currentRating = business.currentRating ?? 0;
    const previousRating = currentRating + amount;
    details.push(
      `Google-rating gedaald van ${previousRating.toFixed(1)} naar ${currentRating.toFixed(1)} (−${amount.toFixed(1)}) in de afgelopen periode`
    );
  }

  if (signals.lowRating) {
    const rating = business.currentRating ?? 0;
    details.push(`Lage Google-rating van ${rating.toFixed(1)} (drempel: ${LOW_RATING_THRESHOLD})`);
  }

  if (signals.negativeSentiment) {
    details.push("Recente reviews zijn overwegend negatief (>40% met rating 2 of lager)");
  }

  if (signals.fewReviews) {
    const count = business.totalReviews ?? 0;
    details.push(
      `Slechts ${count} Google-reviews — beperkte online zichtbaarheid en naamsbekendheid`
    );
  }

  if (signals.stalePresence) {
    details.push("Geen nieuwe review-activiteit in de afgelopen 3+ maanden");
  }

  if (signals.reducedHours) {
    details.push("Openingstijden zijn beperkter dan gebruikelijk voor horeca (minder dan 6 dagen/week of korte dagen)");
  }

  if (signals.reviewDecline) {
    details.push("Afname in het aantal nieuwe reviews per periode — dalende klantenstroom");
  }

  if (signals.ownerMultipleLocations) {
    details.push(
      `Eigenaar heeft ${business.chainSize ?? "meerdere"} locaties — mogelijk bereid een vestiging af te stoten`
    );
  }

  if (signals.priceMismatch) {
    details.push("Prijsniveau lijkt niet overeen te komen met de geleverde kwaliteit (hoge prijs, lage waardering)");
  }

  // Crawled data signalen
  if (signals.listedForSale) {
    details.push("Zaak is actief te koop aangeboden op een horeca marktplaats of in overnamenieuws");
  }

  if (signals.newsOvernameSignal) {
    details.push("Horeca nieuwsbronnen bevatten overname- of verkoopsignalen voor deze zaak");
  }

  if (signals.deliveryRatingLow) {
    const ratingText = business.thuisbezorgdRating != null
      ? ` (${business.thuisbezorgdRating.toFixed(1)}/10)`
      : "";
    details.push(
      `Lage delivery rating op Thuisbezorgd${ratingText} — duidt op structurele kwaliteitsproblemen bezorgservice`
    );
  }

  if (signals.ketenWithIssues) {
    const grootte = business.kvkKetenGrootte ?? business.chainSize ?? "meerdere";
    details.push(
      `Keten-eigenaar met ${grootte} vestigingen en dalende kwaliteit — mogelijk bereid vestiging(en) af te stoten`
    );
  }

  return details;
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Voert een volledige signaalanalyse uit op een horeca-bedrijf.
 *
 * Combineert alle sub-detectoren en berekent een totaalscore.
 * Dit is het hoofdingangspunt voor de Overname Intelligence Scanner.
 *
 * @param business - Huidige bedrijfsgegevens (uit MonitoredBusiness)
 * @param snapshots - Historische snapshots (uit BusinessSnapshot[])
 * @returns Volledige signaalanalyse met score, vlaggen en Nederlandse omschrijvingen
 *
 * @example
 * ```typescript
 * const analysis = detectSignals(businessData, snapshotHistory);
 * if (analysis.signalScore >= 50) {
 *   console.log("Sterk overname-signaal:", analysis.topSignal);
 * }
 * ```
 */
export function detectSignals(
  business: MonitoredBusinessData,
  snapshots: BusinessSnapshotData[]
): SignalAnalysis {
  // Run alle sub-detectoren
  const ratingDropResult = detectRatingDrop(snapshots);
  const reviewDecline = detectReviewDecline(snapshots);
  const stalePresence = detectStaleness(business, snapshots);
  const lowRating = detectLowRating(business);
  const fewReviews = detectFewReviews(business);
  const closedStatus = detectClosedStatus(business);
  const reducedHours = detectReducedHours(business);
  const priceMismatch = detectPriceMismatch(business);
  const negativeSentiment = detectNegativeSentiment(snapshots);

  // Keten-detectie: eigenaar met meerdere locaties
  const ownerMultipleLocations =
    business.chainSize != null && business.chainSize > 1;

  // Crawled data signalen — gebruik optionele velden uit MonitoredBusinessData
  const listedForSale = business.newsHasOvernameSignal === true;
  const newsOvernameSignal = business.newsHasOvernameSignal === true;
  const deliveryRatingLow =
    business.thuisbezorgdRating != null &&
    typeof business.thuisbezorgdRating === "number" &&
    !isNaN(business.thuisbezorgdRating) &&
    business.thuisbezorgdRating < DELIVERY_RATING_LOW_THRESHOLD;
  const ketenWithIssues =
    (business.kvkIsKeten === true &&
      business.kvkKetenGrootte != null &&
      business.kvkKetenGrootte > 1 &&
      business.currentRating != null &&
      business.currentRating < LOW_RATING_THRESHOLD) ||
    (business.chainSize != null &&
      business.chainSize > 1 &&
      business.currentRating != null &&
      business.currentRating < LOW_RATING_THRESHOLD);

  // Stel het signalen-object samen
  const signals: SignalAnalysis["signals"] = {
    ratingDrop: ratingDropResult.detected,
    ratingDropAmount: ratingDropResult.detected
      ? ratingDropResult.amount
      : undefined,
    reviewDecline,
    negativeSentiment,
    recentlyClosed: closedStatus.permanentlyClosed,
    temporarilyClosed: closedStatus.temporarilyClosed,
    ownerMultipleLocations,
    lowRating,
    fewReviews,
    stalePresence,
    reducedHours,
    priceMismatch,
    listedForSale,
    deliveryRatingLow,
    newsOvernameSignal,
    ketenWithIssues,
  };

  // Bereken score
  const signalScore = calculateSignalScore(signals);

  // Genereer Nederlandse teksten
  const topSignal = getTopSignal(signals, business);
  const signalDetails = getSignalDetails(signals, business);

  return {
    signalScore,
    signals,
    topSignal,
    signalDetails,
  };
}

// ---------------------------------------------------------------------------
// Hulpfuncties (private)
// ---------------------------------------------------------------------------

/**
 * Berekent de groeisnelheid van reviews over een reeks snapshots.
 *
 * @returns Reviews per dag
 */
function calculateReviewGrowthRate(
  snapshots: Array<BusinessSnapshotData & { reviewCount: number }>
): number {
  if (snapshots.length < 2) {
    return 0;
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const reviewDiff = last.reviewCount - first.reviewCount;
  const daysDiff =
    (new Date(last.scannedAt).getTime() - new Date(first.scannedAt).getTime()) /
    (1000 * 60 * 60 * 24);

  if (daysDiff <= 0) {
    return 0;
  }

  return reviewDiff / daysDiff;
}

/**
 * Parseert een tijdstring (bijv. "0930" of "1800") naar minuten sinds middernacht.
 */
function parseTimeToMinutes(time: string | undefined | null): number | null {
  if (time == null || typeof time !== "string") {
    return null;
  }

  // Formaat: "HHMM" (bijv. "0930", "1800")
  if (time.length === 4 && /^\d{4}$/.test(time)) {
    const hours = parseInt(time.slice(0, 2), 10);
    const minutes = parseInt(time.slice(2, 4), 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }

  // Formaat: "HH:MM" (bijv. "09:30", "18:00")
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

/**
 * Controleert of een object leeg is ({} of alle waarden null/undefined).
 */
function isEmptyObject(obj: unknown): boolean {
  if (obj == null) return true;
  if (typeof obj !== "object") return false;
  if (Array.isArray(obj)) return obj.length === 0;
  return Object.keys(obj as Record<string, unknown>).length === 0;
}

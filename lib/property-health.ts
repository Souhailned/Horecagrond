/**
 * Pure scoring function for property listing health.
 * No database dependency — operates entirely on the provided input.
 */

export interface HealthScoreInput {
  hasDescription: boolean;
  descriptionLength: number;
  imageCount: number;
  hasPrice: boolean;
  viewCount: number;
  inquiryCount: number;
  daysOnline: number | null;
  avgViewsInCity?: number;
  avgInquiriesInCity?: number;
}

export interface HealthScoreBreakdown {
  content: number; // 0-25
  quality: number; // 0-25
  performance: number; // 0-25
  price: number; // 0-15
  freshness: number; // 0-10
}

export interface HealthScoreResult {
  score: number; // 0-100
  breakdown: HealthScoreBreakdown;
  issues: string[]; // Dutch issue descriptions
}

export function calculateHealthScore(
  input: HealthScoreInput
): HealthScoreResult {
  const issues: string[] = [];

  // ─── Content (0-25) ───────────────────────────────────────────
  let content = 0;

  if (input.hasDescription) {
    content += 8;
  } else {
    issues.push("Geen beschrijving");
  }

  if (input.descriptionLength > 100) {
    content += 7;
  } else if (input.hasDescription) {
    issues.push("Beschrijving is te kort (minder dan 100 tekens)");
  }

  if (input.imageCount >= 3) {
    content += 5;
  } else {
    issues.push(
      input.imageCount === 0
        ? "Geen foto's toegevoegd"
        : "Minder dan 3 foto's"
    );
  }

  if (input.hasPrice) {
    content += 5;
  } else {
    issues.push("Geen prijs ingesteld");
  }

  // ─── Quality (0-25) ──────────────────────────────────────────
  let quality = 0;

  if (input.descriptionLength > 300) {
    quality += 10;
  } else if (input.descriptionLength > 100) {
    issues.push("Beschrijving korter dan 300 tekens voor maximale kwaliteit");
  }

  if (input.imageCount >= 8) {
    quality += 10;
  } else if (input.imageCount >= 5) {
    quality += 5;
    issues.push("Minder dan 8 foto's voor optimale presentatie");
  } else {
    issues.push("Minder dan 5 foto's voor een goede presentatie");
  }

  if (input.imageCount >= 5) {
    quality += 5;
  }

  // ─── Performance (0-25) ──────────────────────────────────────
  let performance = 0;

  if (
    input.avgViewsInCity !== undefined &&
    input.avgViewsInCity > 0
  ) {
    // Benchmark against city average
    const viewRatio = input.viewCount / input.avgViewsInCity;
    if (viewRatio >= 1) {
      performance += 15;
    } else if (viewRatio >= 0.5) {
      performance += 9;
      issues.push("Minder weergaven dan gemiddeld in deze stad");
    } else {
      performance += 3;
      issues.push("Aanzienlijk minder weergaven dan gemiddeld in deze stad");
    }

    if (
      input.avgInquiriesInCity !== undefined &&
      input.avgInquiriesInCity > 0
    ) {
      const inquiryRatio = input.inquiryCount / input.avgInquiriesInCity;
      if (inquiryRatio >= 1) {
        performance += 10;
      } else if (inquiryRatio >= 0.5) {
        performance += 6;
        issues.push("Minder aanvragen dan gemiddeld in deze stad");
      } else {
        performance += 2;
        issues.push(
          "Aanzienlijk minder aanvragen dan gemiddeld in deze stad"
        );
      }
    } else {
      // No inquiry benchmark — score based on absolute inquiry count
      if (input.inquiryCount >= 5) {
        performance += 10;
      } else if (input.inquiryCount >= 2) {
        performance += 6;
      } else if (input.inquiryCount >= 1) {
        performance += 3;
      } else {
        issues.push("Nog geen aanvragen ontvangen");
      }
    }
  } else {
    // No city benchmark — use absolute thresholds
    if (input.viewCount > 50) {
      performance += 20;
    } else if (input.viewCount > 20) {
      performance += 12;
      issues.push("Relatief weinig weergaven");
    } else if (input.viewCount > 5) {
      performance += 5;
      issues.push("Weinig weergaven");
    } else {
      issues.push("Zeer weinig weergaven");
    }

    if (input.inquiryCount >= 3) {
      performance += 5;
    } else if (input.inquiryCount >= 1) {
      performance += 2;
    } else if (input.viewCount > 20 && input.inquiryCount === 0) {
      issues.push("Weergaven maar geen aanvragen — overweeg de prijs of beschrijving aan te passen");
    }
  }

  // ─── Price (0-15) ────────────────────────────────────────────
  let price = 0;

  if (input.hasPrice) {
    price = 15;
  }
  // Issue for missing price already captured in Content section

  // ─── Freshness (0-10) ────────────────────────────────────────
  let freshness = 0;

  if (input.daysOnline === null) {
    // Draft / not published
    freshness = 5;
    issues.push("Pand is nog niet gepubliceerd");
  } else if (input.daysOnline < 7) {
    freshness = 10;
  } else if (input.daysOnline < 30) {
    freshness = 7;
  } else if (input.daysOnline < 60) {
    freshness = 4;
    issues.push("Al langer dan 30 dagen online");
  } else {
    freshness = 0;
    if (input.inquiryCount === 0) {
      issues.push("Al 60+ dagen online zonder aanvragen");
    } else {
      issues.push("Al 60+ dagen online — overweeg de vermelding te vernieuwen");
    }
  }

  // ─── Total ────────────────────────────────────────────────────
  const score = Math.min(
    100,
    content + quality + performance + price + freshness
  );

  return {
    score,
    breakdown: {
      content,
      quality,
      performance,
      price,
      freshness,
    },
    issues,
  };
}

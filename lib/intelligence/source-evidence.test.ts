import { describe, expect, it } from "vitest";

import { buildSourceEvidenceSnapshot } from "./source-evidence";

describe("buildSourceEvidenceSnapshot", () => {
  it("builds fetched evidence with freshness and facts for website data", () => {
    const fetchedAt = new Date("2026-03-26T12:00:00.000Z");
    const snapshot = buildSourceEvidenceSnapshot(
      "website",
      {
        concept: "Turks grillrestaurant met delivery",
        hasDelivery: true,
        hasOnlineReservation: false,
        menuItems: [{ name: "Doner" }, { name: "Lahmacun" }],
        languages: ["nl", "en"],
      },
      { fetchedAt, url: "https://example.com" },
    );

    expect(snapshot.status).toBe("fetched");
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.expiresAt).not.toBeNull();
    expect(snapshot.facts).toMatchObject({
      concept: "Turks grillrestaurant met delivery",
      hasDelivery: true,
      menuItemsCount: 2,
      languageCount: 2,
    });
  });

  it("builds failed evidence for missing source payloads", () => {
    const snapshot = buildSourceEvidenceSnapshot("news", null, {
      error: "timeout",
    });

    expect(snapshot.status).toBe("failed");
    expect(snapshot.confidence).toBe("low");
    expect(snapshot.error).toBe("timeout");
    expect(snapshot.facts).toBeNull();
  });

  it("marks missing website payloads as missing instead of failed", () => {
    const snapshot = buildSourceEvidenceSnapshot("website", null, {
      url: "https://example.com",
    });

    expect(snapshot.status).toBe("missing");
    expect(snapshot.confidence).toBe("low");
    expect(snapshot.url).toBe("https://example.com");
  });

  it("keeps empty news results at low confidence", () => {
    const snapshot = buildSourceEvidenceSnapshot("news", {
      hasOvernameSignal: false,
      hasFaillissementSignal: false,
      items: [],
    });

    expect(snapshot.status).toBe("fetched");
    expect(snapshot.confidence).toBe("low");
    expect(snapshot.qualityScore).toBe(0);
  });

  it("scores positive news evidence above empty results", () => {
    const snapshot = buildSourceEvidenceSnapshot("news", {
      hasOvernameSignal: true,
      hasFaillissementSignal: false,
      items: [{ title: "Zaak te koop" }],
    });

    expect(snapshot.status).toBe("fetched");
    expect(snapshot.qualityScore).toBeGreaterThan(0);
    expect(snapshot.confidence).not.toBe("low");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  intelligenceMatch: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  intelligenceProfile: {
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
}));

describe("saveMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes stale matches that are no longer in the current result set", async () => {
    prismaMock.intelligenceMatch.count.mockResolvedValue(1);

    const { saveMatches } = await import("./matcher");

    const count = await saveMatches(
      "profile-1",
      [
        {
          businessId: "biz-1",
          matchScore: 88,
          breakdown: {
            location: 30,
            concept: 25,
            demographics: 18,
            signals: 10,
            surface: 5,
          },
        },
      ],
      new Map([["biz-1", "Sterke match"]]),
    );

    expect(prismaMock.intelligenceMatch.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.intelligenceMatch.deleteMany).toHaveBeenCalledWith({
      where: {
        profileId: "profile-1",
        businessId: { notIn: ["biz-1"] },
        status: { in: ["new", "reviewed", "starred", "dismissed"] },
      },
    });
    expect(prismaMock.intelligenceProfile.update).toHaveBeenCalled();
    expect(count).toBe(1);
  });
});

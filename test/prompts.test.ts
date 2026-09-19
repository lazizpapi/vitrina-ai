import { describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const { buildPrompts } = await import("../src/generation/prompts.js");
const { CARD_ORDER, CARDS, GLOBAL_NEGATIVE } = await import("../src/generation/cards.js");

const brief = {
  title: "Termos Stanley 1.2 L",
  priceUzs: 349_000,
  bullets: ["24 soat issiq saqlaydi"],
  lang: "uz" as const,
};

function completion(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

describe("buildPrompts", () => {
  it("appends the card guidance and the no-text clause to every prompt", async () => {
    create.mockResolvedValueOnce(
      completion({
        category: "drinkware",
        prompts: {
          main: "Studio shot on seamless grey.",
          lifestyle: "On a kitchen counter at sunrise.",
          model: "Held by a hiker.",
          infographic: "Gradient backdrop, product low in frame.",
        },
        overlay: { title: "Termos Stanley", bullets: ["Issiq 24 soat", "Po'lat", "Kafolat"] },
      }),
    );

    const set = await buildPrompts(brief);

    expect(set.category).toBe("drinkware");
    for (const card of CARD_ORDER) {
      expect(set.prompts[card]).toContain(CARDS[card].guidance);
      expect(set.prompts[card]).toContain(GLOBAL_NEGATIVE);
    }
    expect(set.prompts.main).toContain("Studio shot on seamless grey.");
  });

  it("falls back to templates when the prompt writer is unavailable", async () => {
    create.mockRejectedValueOnce(new Error("503"));

    const set = await buildPrompts(brief);

    expect(set.prompts.main).toContain(brief.title);
    expect(set.prompts.main).toContain(GLOBAL_NEGATIVE);
    expect(set.overlay.title).toBe(brief.title);
  });

  it("always produces exactly three overlay bullets, padded in the seller's language", async () => {
    create.mockRejectedValueOnce(new Error("offline"));

    const set = await buildPrompts(brief);

    expect(set.overlay.bullets).toHaveLength(3);
    expect(set.overlay.bullets[0]).toBe("24 soat issiq saqlaydi");
    expect(set.overlay.bullets.slice(1).join(" ")).toMatch(/[A-Za-z']/);
  });

  it("pads Russian briefs with Russian filler", async () => {
    create.mockRejectedValueOnce(new Error("offline"));

    const set = await buildPrompts({ ...brief, bullets: [], lang: "ru" });

    expect(set.overlay.bullets).toHaveLength(3);
    expect(set.overlay.bullets.join(" ")).toMatch(/[А-Яа-я]/);
  });

  it("clamps overlay copy so it fits the card", async () => {
    create.mockResolvedValueOnce(
      completion({
        category: "drinkware",
        prompts: { main: "a", lifestyle: "b", model: "c", infographic: "d" },
        overlay: {
          title: "x".repeat(120),
          bullets: ["y".repeat(120), "short", "also short"],
        },
      }),
    );

    const set = await buildPrompts(brief);

    expect(set.overlay.title.length).toBeLessThanOrEqual(40);
    expect(set.overlay.bullets[0]!.length).toBeLessThanOrEqual(32);
  });

  it("repairs an empty prompt rather than sending it to the model", async () => {
    create.mockResolvedValueOnce(
      completion({
        category: "drinkware",
        prompts: { main: "  ", lifestyle: "b", model: "c", infographic: "d" },
        overlay: { title: "T", bullets: ["1", "2", "3"] },
      }),
    );

    const set = await buildPrompts(brief);

    expect(set.prompts.main).toContain(brief.title);
  });
});

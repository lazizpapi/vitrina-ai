import { beforeEach, describe, expect, it, vi } from "vitest";

const parse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse } };
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

function reply(parsed: unknown, stop_reason = "end_turn") {
  return { parsed_output: parsed, stop_reason, content: [] };
}

const good = {
  category: "drinkware",
  prompts: {
    main: "Studio shot on seamless grey.",
    lifestyle: "On a kitchen counter at sunrise.",
    model: "Held by a hiker.",
    infographic: "Gradient backdrop, product low in frame.",
  },
  overlay: { title: "Termos Stanley", bullets: ["Issiq 24 soat", "Po'lat", "Kafolat"] },
};

beforeEach(() => {
  parse.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("buildPrompts", () => {
  it("asks Claude for a structured prompt set, with refusal fallback enabled", async () => {
    parse.mockResolvedValueOnce(reply(good));

    await buildPrompts(brief);

    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toContain("server-side-fallback-2026-07-01");
    expect(request.output_config.effort).toBe("medium");
    expect(request.output_config.format).toBeDefined();
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("thinking");
  });

  it("appends the card guidance and the no-text clause to every prompt", async () => {
    parse.mockResolvedValueOnce(reply(good));

    const set = await buildPrompts(brief);

    expect(set.category).toBe("drinkware");
    for (const card of CARD_ORDER) {
      expect(set.prompts[card]).toContain(CARDS[card].guidance);
      expect(set.prompts[card]).toContain(GLOBAL_NEGATIVE);
    }
    expect(set.prompts.main).toContain("Studio shot on seamless grey.");
  });

  it("falls back to templates when the API is unavailable", async () => {
    parse.mockRejectedValueOnce(new Error("503"));

    const set = await buildPrompts(brief);

    expect(set.prompts.main).toContain(brief.title);
    expect(set.prompts.main).toContain(GLOBAL_NEGATIVE);
    expect(set.overlay.title).toBe(brief.title);
  });

  it("falls back to templates when the whole chain refuses", async () => {
    parse.mockResolvedValueOnce(reply(null, "refusal"));

    const set = await buildPrompts(brief);

    expect(set.category).toBe("general");
    expect(set.prompts.main).toContain(brief.title);
  });

  it("falls back to templates when the output does not match the schema", async () => {
    parse.mockResolvedValueOnce(reply(null));

    const set = await buildPrompts(brief);

    expect(set.prompts.main).toContain(brief.title);
  });

  it("says why it fell back, so a missing key does not fail silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parse.mockRejectedValueOnce(new Error("authentication_error"));

    await buildPrompts(brief);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("authentication_error"));
  });

  it("always produces exactly three overlay bullets, padded in the seller's language", async () => {
    parse.mockRejectedValueOnce(new Error("offline"));

    const set = await buildPrompts(brief);

    expect(set.overlay.bullets).toHaveLength(3);
    expect(set.overlay.bullets[0]).toBe("24 soat issiq saqlaydi");
    expect(set.overlay.bullets.slice(1).join(" ")).toMatch(/[A-Za-z']/);
  });

  it("pads Russian briefs with Russian filler", async () => {
    parse.mockRejectedValueOnce(new Error("offline"));

    const set = await buildPrompts({ ...brief, bullets: [], lang: "ru" });

    expect(set.overlay.bullets).toHaveLength(3);
    expect(set.overlay.bullets.join(" ")).toMatch(/[А-Яа-я]/);
  });

  it("clamps overlay copy so it fits the card", async () => {
    parse.mockResolvedValueOnce(
      reply({
        ...good,
        overlay: { title: "x".repeat(120), bullets: ["y".repeat(120), "short", "also short"] },
      }),
    );

    const set = await buildPrompts(brief);

    expect(set.overlay.title.length).toBeLessThanOrEqual(40);
    expect(set.overlay.bullets[0]!.length).toBeLessThanOrEqual(32);
  });

  it("repairs an empty prompt rather than sending it to the image model", async () => {
    parse.mockResolvedValueOnce(reply({ ...good, prompts: { ...good.prompts, main: "  " } }));

    const set = await buildPrompts(brief);

    expect(set.prompts.main).toContain(brief.title);
  });
});

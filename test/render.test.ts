import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CARD_HEIGHT, CARD_WIDTH, formatPrice, renderInfographic } from "../src/render/infographic.js";
import { parsePrice, splitBullets } from "../src/bot/index.js";

async function backdrop(): Promise<Buffer> {
  return sharp({
    create: { width: 900, height: 1200, channels: 3, background: "#E7ECF3" },
  })
    .jpeg()
    .toBuffer();
}

describe("formatPrice", () => {
  it("groups thousands and uses the local currency word", () => {
    expect(formatPrice(349_000, "uz")).toBe("349 000 so'm");
    expect(formatPrice(349_000, "ru")).toBe("349 000 сум");
  });
});

describe("parsePrice", () => {
  it("accepts the ways a seller writes a sum", () => {
    expect(parsePrice("349000")).toBe(349_000);
    expect(parsePrice("349 000")).toBe(349_000);
    expect(parsePrice("349.000")).toBe(349_000);
    expect(parsePrice("1 250 000")).toBe(1_250_000);
  });

  it("rejects anything that is not a plausible price", () => {
    expect(parsePrice("дорого")).toBeNull();
    expect(parsePrice("12")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("splitBullets", () => {
  it("takes at most three lines and strips list markers", () => {
    expect(splitBullets("- Bir\n• Ikki\n* Uch\nTo'rt")).toEqual(["Bir", "Ikki", "Uch"]);
  });

  it("drops blank lines", () => {
    expect(splitBullets("Bir\n\n\nIkki")).toEqual(["Bir", "Ikki"]);
  });
});

describe("renderInfographic", () => {
  it("returns a marketplace-spec JPEG whatever the backdrop size", async () => {
    const out = await renderInfographic({
      background: await backdrop(),
      title: "Termos Stanley 1.2 L — qora rang",
      priceUzs: 349_000,
      bullets: ["24 soat issiq saqlaydi", "Zanglamaydigan po'lat", "Гарантия 12 месяцев"],
      lang: "uz",
    });

    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(3 / 4);
  });

  it("renders without a price or bullets", async () => {
    const out = await renderInfographic({
      background: await backdrop(),
      title: "Чайник",
      priceUzs: null,
      bullets: [],
      lang: "ru",
    });
    const meta = await sharp(out).metadata();
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it("does not let markup in the seller's text break the render", async () => {
    const out = await renderInfographic({
      background: await backdrop(),
      title: '<b>Chexol</b> & "Pro" <span>',
      priceUzs: 99_000,
      bullets: ["<i>Mustahkam</i>", "A & B", "100% paxta"],
      lang: "uz",
    });
    expect((await sharp(out).metadata()).width).toBe(CARD_WIDTH);
  });
});

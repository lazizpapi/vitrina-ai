import sharp from "sharp";
import { bundledFont, pangoFont } from "./fonts.js";
import type { Lang } from "../generation/brief.js";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 1600;

const MARGIN = 48;
const PAD = 40;
const RADIUS = 32;
const INK = "#0F172A";
const MUTED = "#334155";
const ACCENT = "#E11D48";

export type InfographicInput = {
  background: Buffer;
  title: string;
  priceUzs: number | null;
  bullets: string[];
  lang: Lang;
};

type Rendered = { buffer: Buffer; width: number; height: number };

/**
 * Draws the seller's copy onto a generated backdrop.
 * Text is rasterised here rather than asked of the image model, because
 * diffusion models mangle Cyrillic and Uzbek Latin.
 */
export async function renderInfographic(input: InfographicInput): Promise<Buffer> {
  const innerWidth = CARD_WIDTH - 2 * MARGIN - 2 * PAD;

  const title = await text(input.title, { size: 62, weight: "Bold", color: INK, width: innerWidth });
  const price = input.priceUzs
    ? await text(formatPrice(input.priceUzs, input.lang), {
        size: 54,
        weight: "Bold",
        color: "#FFFFFF",
        width: innerWidth,
      })
    : null;

  const bulletWidth = innerWidth - 64;
  const bullets: Rendered[] = [];
  for (const b of input.bullets.slice(0, 3)) {
    if (b.trim()) bullets.push(await text(b, { size: 40, weight: "Regular", color: MUTED, width: bulletWidth }));
  }

  const badgeHeight = price ? price.height + 36 : 0;
  const topHeight = PAD + title.height + (price ? 28 + badgeHeight : 0) + PAD;

  const bulletGap = 26;
  const bulletsHeight = bullets.reduce((sum, b) => sum + Math.max(b.height, 44), 0) + bulletGap * Math.max(bullets.length - 1, 0);
  const bottomHeight = bullets.length ? PAD + bulletsHeight + PAD : 0;
  const bottomY = CARD_HEIGHT - MARGIN - bottomHeight;

  const layers: sharp.OverlayOptions[] = [];
  layers.push({ input: Buffer.from(scrimSvg(topHeight, bottomY, bottomHeight, bullets)), top: 0, left: 0 });
  layers.push({ input: title.buffer, top: MARGIN + PAD, left: MARGIN + PAD });

  if (price) {
    const badgeTop = MARGIN + PAD + title.height + 28;
    const badgeWidth = price.width + 56;
    layers.push({
      input: Buffer.from(badgeSvg(badgeWidth, badgeHeight)),
      top: badgeTop,
      left: MARGIN + PAD,
    });
    layers.push({ input: price.buffer, top: badgeTop + 18, left: MARGIN + PAD + 28 });
  }

  let cursor = bottomY + PAD;
  for (const b of bullets) {
    const rowHeight = Math.max(b.height, 44);
    layers.push({ input: b.buffer, top: cursor + Math.round((rowHeight - b.height) / 2), left: MARGIN + PAD + 64 });
    cursor += rowHeight + bulletGap;
  }

  return sharp(input.background)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: "attention" })
    .composite(layers)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function text(
  value: string,
  opts: { size: number; weight: "Bold" | "Regular"; color: string; width: number },
): Promise<Rendered> {
  const font = bundledFont(opts.weight);
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${opts.color}">${escapeXml(value)}</span>`,
      font: pangoFont(opts.weight, opts.size),
      ...(font ? { fontfile: font.file } : {}),
      width: opts.width,
      rgba: true,
      align: "left",
      wrap: "word",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

function scrimSvg(topHeight: number, bottomY: number, bottomHeight: number, bullets: Rendered[]): string {
  const w = CARD_WIDTH - 2 * MARGIN;
  const marks = bullets.length ? checkMarks(bottomY, bullets) : "";
  const bottom = bottomHeight
    ? `<rect x="${MARGIN}" y="${bottomY}" width="${w}" height="${bottomHeight}" rx="${RADIUS}" fill="#FFFFFF" fill-opacity="0.93"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
  <rect x="${MARGIN}" y="${MARGIN}" width="${w}" height="${topHeight}" rx="${RADIUS}" fill="#FFFFFF" fill-opacity="0.93"/>
  ${bottom}
  ${marks}
</svg>`;
}

/** Check marks are drawn as paths, so they need no font. */
function checkMarks(bottomY: number, bullets: Rendered[]): string {
  const gap = 26;
  let cursor = bottomY + PAD;
  const out: string[] = [];
  for (const b of bullets) {
    const rowHeight = Math.max(b.height, 44);
    const cy = cursor + rowHeight / 2;
    const cx = MARGIN + PAD + 20;
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="20" fill="${ACCENT}"/>` +
        `<path d="M ${cx - 9} ${cy} l 6 7 l 12 -14" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    cursor += rowHeight + gap;
  }
  return out.join("\n  ");
}

function badgeSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="${ACCENT}"/>
</svg>`;
}

export function formatPrice(amount: number, lang: Lang): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return lang === "uz" ? `${grouped} so'm` : `${grouped} сум`;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

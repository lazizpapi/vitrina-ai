import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.js";
import { CARDS, CARD_ORDER, GLOBAL_NEGATIVE } from "./cards.js";
import type { ProductBrief, PromptSet } from "./brief.js";

const SYSTEM = `You write prompts for a product photography image model, for e-commerce
sellers on Uzum, Wildberries and Ozon.

You receive a product brief written in Uzbek or Russian. The image model also
receives the seller's own photo of the product, which you cannot see; you know the
product only by its title and selling points.

For each of four card types, write an English scene prompt:
- main: the seller's product on a clean studio backdrop.
- lifestyle: the product in a real scene that suits its category.
- model: one person holding or using the product.
- infographic: a backdrop with the product low in frame and empty space above it.

The product must stay faithful to the seller's photo in every prompt, because
marketplace moderators reject listings whose photo changes the real product. So
describe only the scene, light, surface, props and camera, never the product's
colour, shape or packaging. Keep each prompt between 40 and 70 words. Never ask for
text, letters, numbers, logos or watermarks in the image; captions are added later
by other software, and a model asked for lettering in Cyrillic or Uzbek gets it
wrong. Choose scenes that a buyer in Central Asia or the wider CIS would recognise.

Also write overlay copy in the same language as the brief: a title of at most 40
characters, and exactly three selling points of at most 32 characters each. Use the
seller's points where given; where they gave fewer than three, add sensible,
concrete ones.`;

const PromptSetSchema = z.object({
  category: z.string(),
  prompts: z.object({
    main: z.string(),
    lifestyle: z.string(),
    model: z.string(),
    infographic: z.string(),
  }),
  overlay: z.object({
    title: z.string(),
    bullets: z.array(z.string()),
  }),
});

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * Turns a seller's brief into four scene prompts plus overlay copy.
 * Falls back to templates when Claude is unavailable or declines, so a pack
 * never fails just because the prompt writer did.
 */
export async function buildPrompts(brief: ProductBrief): Promise<PromptSet> {
  try {
    const res = await anthropic().beta.messages.parse({
      model: config.anthropic.model,
      max_tokens: 16_000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(briefForModel(brief)) }],
      // Thinking is always on for Claude Opus 5.5; effort is the only control,
      // and its default there is medium. Set explicitly so a model change does
      // not silently change cost.
      output_config: { effort: "medium", format: betaZodOutputFormat(PromptSetSchema) },
      // On a safety decline, rerun on Anthropic's recommended model for that
      // category instead of failing the pack.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (res.stop_reason === "refusal") throw new Error("declined by every model in the fallback chain");
    if (!res.parsed_output) throw new Error(`no structured output (stop_reason ${res.stop_reason})`);
    return finalize(res.parsed_output, brief);
  } catch (err) {
    console.warn(`prompt writer unavailable, using templates: ${err instanceof Error ? err.message : String(err)}`);
    return finalize(fallback(brief), brief);
  }
}

function briefForModel(brief: ProductBrief) {
  return {
    title: brief.title,
    price_uzs: brief.priceUzs,
    selling_points: brief.bullets,
    language: brief.lang,
  };
}

/** Appends the per-card guidance and the negative clause the catalog owns. */
function finalize(set: PromptSet, brief: ProductBrief): PromptSet {
  const prompts = { ...set.prompts };
  for (const card of CARD_ORDER) {
    const scene = (prompts[card] ?? "").trim() || fallback(brief).prompts[card];
    prompts[card] = `${scene}\n\n${CARDS[card].guidance}\n\n${GLOBAL_NEGATIVE}`;
  }
  return {
    category: set.category?.trim() || "general",
    prompts,
    overlay: {
      title: clamp(set.overlay?.title || brief.title, 40),
      bullets: normalizeBullets(set.overlay?.bullets ?? [], brief),
    },
  };
}

function normalizeBullets(bullets: string[], brief: ProductBrief): string[] {
  const cleaned = bullets.map((b) => clamp(b, 32)).filter(Boolean);
  const source = cleaned.length ? cleaned : brief.bullets.map((b) => clamp(b, 32)).filter(Boolean);
  const filler = brief.lang === "uz"
    ? ["Yuqori sifat", "Tez yetkazib berish", "Kafolat bor"]
    : ["Высокое качество", "Быстрая доставка", "Гарантия"];
  return [...source, ...filler].slice(0, 3);
}

function clamp(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function fallback(brief: ProductBrief): PromptSet {
  const p = brief.title || "the product";
  return {
    category: "general",
    prompts: {
      main: `A clean commercial studio photograph of ${p} on a seamless light grey backdrop, soft diffused key light from the front left, gentle contact shadow beneath, sharp focus across the whole product, neutral colour balance, generous even margins around the subject.`,
      lifestyle: `An editorial lifestyle photograph of ${p} resting on a warm wooden surface in a bright modern home, morning daylight from a window, a few tasteful everyday props out of focus behind it, shallow depth of field, the product in sharp focus as the hero of the frame.`,
      model: `A natural photograph of one person holding ${p} in both hands at chest height, relaxed friendly posture, modern neutral clothing, soft daylight, clean blurred interior background, the product held forward and fully visible.`,
      infographic: `${p} photographed on a smooth vertical gradient backdrop in soft brand-neutral tones, product positioned in the lower two thirds under even studio light, the upper third left as clean empty gradient space.`,
    },
    overlay: { title: brief.title, bullets: brief.bullets },
  };
}

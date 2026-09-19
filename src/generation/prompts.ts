import OpenAI from "openai";
import { config } from "../config.js";
import { CARDS, CARD_ORDER, GLOBAL_NEGATIVE } from "./cards.js";
import type { ProductBrief, PromptSet } from "./brief.js";

const SYSTEM = `You write prompts for a product photography image model, for e-commerce
sellers on Uzum, Wildberries and Ozon.

You receive a product brief written in Uzbek or Russian, plus the product's own photo
(described only by its title). You return English scene prompts, one per card type.

Rules:
- The product must stay pixel-faithful to the seller's reference photo in every prompt.
  Never invent a different product, colour, label or shape.
- Describe only the scene, light, surface, props and camera. 40 to 70 words each.
- Never ask for text, letters, numbers, logos or watermarks in the image.
- Scenes must suit the product category and a Central Asian / CIS marketplace audience.
- overlay.title: at most 40 characters, in the SAME language as the brief.
- overlay.bullets: exactly three, at most 32 characters each, in the SAME language as the
  brief, each a concrete selling point. Invent sensible ones only if the brief gives none.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "prompts", "overlay"],
  properties: {
    category: { type: "string" },
    prompts: {
      type: "object",
      additionalProperties: false,
      required: ["main", "lifestyle", "model", "infographic"],
      properties: {
        main: { type: "string" },
        lifestyle: { type: "string" },
        model: { type: "string" },
        infographic: { type: "string" },
      },
    },
    overlay: {
      type: "object",
      additionalProperties: false,
      required: ["title", "bullets"],
      properties: {
        title: { type: "string" },
        bullets: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

let client: OpenAI | null = null;
function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

/**
 * Turns a seller's brief into four scene prompts plus overlay copy.
 * Falls back to templates when OpenAI is unavailable, so a pack never fails
 * just because the prompt writer is down.
 */
export async function buildPrompts(brief: ProductBrief): Promise<PromptSet> {
  try {
    const res = await openai().chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(briefForModel(brief)) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "prompt_set", strict: true, schema },
      },
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) throw new Error("empty completion");
    return finalize(JSON.parse(raw) as PromptSet, brief);
  } catch {
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

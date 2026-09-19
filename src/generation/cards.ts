/**
 * The card catalog. Each card type is one generated asset in a product pack.
 * Settings live here, not in the pipeline, so adding a card type or switching
 * a model is a data change.
 */

export type CardType = "main" | "lifestyle" | "model" | "infographic";

export type CardSpec = {
  type: CardType;
  /** Endpoint path on the Higgsfield API. */
  endpoint: string;
  aspectRatio: "3:4";
  resolution: "1k" | "2k" | "4k";
  quality: "low" | "medium" | "high";
  /** True when the seller's own photo must be passed as a reference image. */
  needsProductReference: boolean;
  /**
   * Text drawn by code on top of the generated image, never by the model.
   * Cyrillic and Uzbek Latin come out wrong when a diffusion model renders them.
   */
  overlay: "none" | "infographic";
  /** Guidance appended to every prompt for this card type. */
  guidance: string;
};

/**
 * Book-keeping estimate per generated image, in USD. The API does not return a
 * price with the result, so this is what `jobs.cost_usd` records. Update it
 * from the rate shown in the Higgsfield console when the catalogue changes.
 */
export const ESTIMATED_COST_USD = 0.02;

export const CARD_ORDER: CardType[] = ["main", "lifestyle", "model", "infographic"];

const base = {
  endpoint: "marketing-studio/image",
  aspectRatio: "3:4",
  resolution: "2k",
  quality: "high",
  needsProductReference: true,
} as const;

export const CARDS: Record<CardType, CardSpec> = {
  // Marketplace main photo. Moderation on Uzum and Wildberries requires the
  // real product, unchanged in shape, colour and configuration. So this is an
  // edit of the seller's photo: background, light and sharpness only.
  main: {
    ...base,
    type: "main",
    overlay: "none",
    guidance:
      "Keep the product itself pixel-faithful to the reference: identical shape, colour, proportions, materials, logos and text on the packaging. Do not redesign, restyle or add objects. Replace only the background with a clean seamless light studio backdrop, add soft even product lighting, a subtle contact shadow, and crisp focus. The product is centred, fully inside frame, occupying about 80 percent of the height, with clean margins.",
  },

  // Secondary card: the product used in a real scene.
  lifestyle: {
    ...base,
    type: "lifestyle",
    overlay: "none",
    guidance:
      "Place the exact product from the reference into a natural lifestyle scene that fits its category. The product stays pixel-faithful: same shape, colour, labels and proportions. Realistic environment light, shallow depth of field, product clearly the hero of the frame and fully visible.",
  },

  // Secondary card: a person using or holding the product.
  model: {
    ...base,
    type: "model",
    overlay: "none",
    guidance:
      "Show one person naturally holding or using the exact product from the reference. The product stays pixel-faithful: same shape, colour, labels and proportions. Hands and pose must be anatomically correct. Neutral modern styling, soft daylight, clean uncluttered background. The product is unobstructed and clearly readable.",
  },

  // Infographic background. The model paints a backdrop with empty space;
  // price and selling points are drawn afterwards by sharp.
  infographic: {
    ...base,
    type: "infographic",
    overlay: "infographic",
    guidance:
      "Marketplace infographic background. The exact product from the reference sits in the lower two thirds of the frame, pixel-faithful in shape, colour and labels. The upper third is a clean, softly graded, low-detail area of empty space reserved for text, with no objects, no patterns and no lettering anywhere in the image. Do not render any text, numbers, letters or watermarks.",
  },
};

/** Never let the model draw glyphs; captions are composited locally. */
export const GLOBAL_NEGATIVE =
  "No text, no letters, no numbers, no captions, no watermarks, no logos added by you, no borders, no collage, no duplicated products.";

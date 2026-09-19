export type Lang = "uz" | "ru";

/** What the seller told the bot about one product. */
export type ProductBrief = {
  title: string;
  priceUzs: number | null;
  bullets: string[];
  lang: Lang;
};

/** What the LLM turned that into. */
export type PromptSet = {
  category: string;
  prompts: Record<"main" | "lifestyle" | "model" | "infographic", string>;
  /** Overlay copy, in the seller's own language, cleaned and shortened. */
  overlay: {
    title: string;
    bullets: string[];
  };
};

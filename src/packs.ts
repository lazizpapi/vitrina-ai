/** A credit buys one product: four cards. */
export type PackCode = "p1" | "p5" | "p20";

export type Pack = {
  code: PackCode;
  credits: number;
  amountUzs: number;
  /** Telegram Stars price. ~1 star ≈ $0.013 payout after platform cut. */
  stars: number;
};

export const PACKS: Record<PackCode, Pack> = {
  p1: { code: "p1", credits: 1, amountUzs: 25_000, stars: 150 },
  p5: { code: "p5", credits: 5, amountUzs: 100_000, stars: 600 },
  p20: { code: "p20", credits: 20, amountUzs: 350_000, stars: 2_000 },
};

export function isPackCode(v: string): v is PackCode {
  return v === "p1" || v === "p5" || v === "p20";
}

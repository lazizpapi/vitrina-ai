import type { Context } from "grammy";
import { PACKS, isPackCode, type PackCode } from "../packs.js";
import { applyLedger, createOrder, markOrderPaid } from "../db/repo.js";
import { t } from "../bot/i18n.js";
import type { Lang } from "../generation/brief.js";

/**
 * Telegram requires digital goods sold inside a bot to be paid in Stars.
 * Click stays available as an external checkout link, which the rule allows.
 */
export async function sendStarsInvoice(ctx: Context, pack: PackCode, lang: Lang): Promise<void> {
  const p = PACKS[pack];
  const tgId = ctx.from!.id;
  const order = await createOrder({
    tgId,
    pack,
    credits: p.credits,
    amountUzs: p.amountUzs,
    provider: "stars",
  });

  const d = t(lang);
  await ctx.replyWithInvoice(
    "Vitrina AI",
    d.packLabel(p.credits, p.amountUzs),
    `order:${order.id}`,
    "XTR",
    [{ label: d.packLabel(p.credits, p.amountUzs), amount: p.stars }],
  );
}

export function orderIdFromPayload(payload: string): string | null {
  const [kind, id] = payload.split(":");
  return kind === "order" && id ? id : null;
}

export function packFromCallback(data: string): PackCode | null {
  const code = data.replace(/^pack:/, "");
  return isPackCode(code) ? code : null;
}

/** Credits the wallet once, however many times Telegram delivers the update. */
export async function creditStarsPayment(
  tgId: number,
  orderId: string,
  credits: number,
  chargeId: string,
): Promise<number> {
  const balance = await applyLedger(tgId, credits, "order", orderId);
  await markOrderPaid(orderId, chargeId);
  return balance;
}

import { createHash } from "node:crypto";
import { config } from "../config.js";
import { applyLedger, getOrder, markOrderPaid } from "../db/repo.js";

/** Error codes defined by the Click Shop API. */
export const ClickError = {
  Ok: 0,
  SignCheckFailed: -1,
  IncorrectAmount: -2,
  ActionNotFound: -3,
  AlreadyPaid: -4,
  UserNotFound: -5,
  TransactionNotFound: -6,
  TransactionCanceled: -9,
} as const;

export type ClickRequest = {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id?: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error?: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
};

export type ClickResponse = {
  click_trans_id: number;
  merchant_trans_id: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  error: number;
  error_note: string;
};

export function md5(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

/**
 * Prepare signs over the order fields; Complete inserts merchant_prepare_id
 * between merchant_trans_id and amount. Getting that order wrong is the usual
 * cause of a -1 from a working integration.
 */
export function expectedSign(req: ClickRequest, secretKey: string): string {
  const isComplete = req.action === "1";
  const parts = [
    req.click_trans_id,
    req.service_id,
    secretKey,
    req.merchant_trans_id,
    ...(isComplete ? [req.merchant_prepare_id ?? ""] : []),
    req.amount,
    req.action,
    req.sign_time,
  ];
  return md5(parts.join(""));
}

export function verifySign(req: ClickRequest, secretKey: string): boolean {
  const expected = expectedSign(req, secretKey);
  const given = (req.sign_string ?? "").toLowerCase();
  return expected.length === given.length && timingSafeEqualHex(expected, given);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function amountsMatch(requested: string, orderAmountUzs: number): boolean {
  const parsed = Number.parseFloat(requested);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(parsed - orderAmountUzs) < 0.5;
}

export function paymentLink(orderId: string, amountUzs: number, botUsername: string): string {
  const params = new URLSearchParams({
    service_id: config.click.serviceId,
    merchant_id: config.click.merchantId,
    merchant_user_id: config.click.merchantUserId,
    amount: String(amountUzs),
    transaction_param: orderId,
    return_url: `https://t.me/${botUsername}?start=paid_${orderId}`,
  });
  return `https://my.click.uz/services/pay?${params.toString()}`;
}

function fail(req: ClickRequest, error: number, note: string): ClickResponse {
  return {
    click_trans_id: Number(req.click_trans_id),
    merchant_trans_id: req.merchant_trans_id,
    error,
    error_note: note,
  };
}

/**
 * Both Click callbacks funnel through here. `onPaid` runs exactly once per
 * order, because the credit is written through the idempotent ledger.
 */
export async function handleClickCallback(
  req: ClickRequest,
  onPaid?: (tgId: number, credits: number, orderId: string) => Promise<void>,
): Promise<ClickResponse> {
  if (!config.click.enabled) return fail(req, ClickError.ActionNotFound, "Click is not enabled");
  if (!verifySign(req, config.click.secretKey)) {
    return fail(req, ClickError.SignCheckFailed, "SIGN CHECK FAILED");
  }
  if (req.action !== "0" && req.action !== "1") {
    return fail(req, ClickError.ActionNotFound, "Action not found");
  }

  const order = await getOrder(req.merchant_trans_id);
  if (!order) return fail(req, ClickError.UserNotFound, "Order not found");
  if (order.status === "canceled") return fail(req, ClickError.TransactionCanceled, "Order canceled");
  if (!amountsMatch(req.amount, order.amount_uzs)) {
    return fail(req, ClickError.IncorrectAmount, "Incorrect parameter amount");
  }
  if (Number(req.error ?? "0") < 0) {
    return fail(req, ClickError.TransactionCanceled, "Payment canceled by Click");
  }

  if (req.action === "0") {
    if (order.status === "paid") return fail(req, ClickError.AlreadyPaid, "Already paid");
    return {
      click_trans_id: Number(req.click_trans_id),
      merchant_trans_id: order.id,
      merchant_prepare_id: 1,
      error: ClickError.Ok,
      error_note: "Success",
    };
  }

  // action === "1": money has moved.
  await applyLedger(order.tg_id, order.credits, "order", order.id);
  if (order.status !== "paid") {
    await markOrderPaid(order.id, req.click_trans_id);
    await onPaid?.(order.tg_id, order.credits, order.id);
  }

  return {
    click_trans_id: Number(req.click_trans_id),
    merchant_trans_id: order.id,
    merchant_confirm_id: 1,
    error: ClickError.Ok,
    error_note: "Success",
  };
}

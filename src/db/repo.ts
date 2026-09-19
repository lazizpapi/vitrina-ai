import { db } from "./client.js";
import type { Lang } from "../generation/brief.js";
import type { CardType } from "../generation/cards.js";
import type { PackCode } from "../packs.js";

export type UserRow = {
  tg_id: number;
  lang: Lang;
  credits: number;
  free_card_used: boolean;
  username: string | null;
};

export async function upsertUser(tgId: number, lang: Lang, username?: string): Promise<UserRow> {
  const existing = await getUser(tgId);
  if (existing) return existing;

  const { data, error } = await db()
    .from("users")
    .insert({ tg_id: tgId, lang, username: username ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as UserRow;
}

export async function getUser(tgId: number): Promise<UserRow | null> {
  const { data, error } = await db().from("users").select("*").eq("tg_id", tgId).maybeSingle();
  if (error) throw error;
  return (data as UserRow) ?? null;
}

export async function setLang(tgId: number, lang: Lang): Promise<void> {
  const { error } = await db().from("users").update({ lang }).eq("tg_id", tgId);
  if (error) throw error;
}

/** Returns the balance after the change. Repeat calls with the same ref are no-ops. */
export async function applyLedger(
  tgId: number,
  delta: number,
  reason: string,
  refId: string,
): Promise<number> {
  const { data, error } = await db().rpc("apply_ledger", {
    p_tg_id: tgId,
    p_delta: delta,
    p_reason: reason,
    p_ref_id: refId,
  });
  if (error) throw error;
  return data as number;
}

/** True only the first time a given user asks. */
export async function claimFreeCard(tgId: number): Promise<boolean> {
  const { data, error } = await db().rpc("claim_free_card", { p_tg_id: tgId });
  if (error) throw error;
  return data === true;
}

export type ProductRow = {
  id: string;
  tg_id: number;
  title: string | null;
  price_uzs: number | null;
  bullets: string[];
  category: string | null;
  source_path: string;
  free: boolean;
};

export async function createProduct(input: {
  tgId: number;
  title: string | null;
  priceUzs: number | null;
  bullets: string[];
  sourcePath: string;
  free: boolean;
}): Promise<ProductRow> {
  const { data, error } = await db()
    .from("products")
    .insert({
      tg_id: input.tgId,
      title: input.title,
      price_uzs: input.priceUzs,
      bullets: input.bullets,
      source_path: input.sourcePath,
      free: input.free,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function setProductCategory(productId: string, category: string): Promise<void> {
  const { error } = await db().from("products").update({ category }).eq("id", productId);
  if (error) throw error;
}

export type JobRow = {
  id: string;
  product_id: string;
  card: CardType;
  status: "pending" | "running" | "done" | "failed";
  output_path: string | null;
  cost_usd: number | null;
  error: string | null;
  attempts: number;
};

export async function createJob(productId: string, card: CardType): Promise<JobRow> {
  const { data, error } = await db()
    .from("jobs")
    .insert({ product_id: productId, card })
    .select()
    .single();
  if (error) throw error;
  return data as JobRow;
}

export async function finishJob(
  jobId: string,
  patch: {
    status: "done" | "failed";
    outputPath?: string | null;
    costUsd?: number | null;
    error?: string | null;
    providerRequestId?: string | null;
    attempts?: number;
  },
): Promise<void> {
  const { error } = await db()
    .from("jobs")
    .update({
      status: patch.status,
      output_path: patch.outputPath ?? null,
      cost_usd: patch.costUsd ?? null,
      error: patch.error ?? null,
      provider_request_id: patch.providerRequestId ?? null,
      attempts: patch.attempts ?? 1,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw error;
}

export type OrderRow = {
  id: string;
  tg_id: number;
  pack: PackCode;
  credits: number;
  amount_uzs: number;
  provider: "click" | "stars";
  status: "pending" | "paid" | "failed" | "canceled";
};

export async function createOrder(input: {
  tgId: number;
  pack: PackCode;
  credits: number;
  amountUzs: number;
  provider: "click" | "stars";
}): Promise<OrderRow> {
  const { data, error } = await db()
    .from("orders")
    .insert({
      tg_id: input.tgId,
      pack: input.pack,
      credits: input.credits,
      amount_uzs: input.amountUzs,
      provider: input.provider,
    })
    .select()
    .single();
  if (error) throw error;
  return data as OrderRow;
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { data, error } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as OrderRow) ?? null;
}

export async function markOrderPaid(id: string, providerTransId: string): Promise<void> {
  const { error } = await db()
    .from("orders")
    .update({ status: "paid", provider_trans_id: providerTransId, paid_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

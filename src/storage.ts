import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db/client.js";

const BUCKET = config.supabase.bucket;

/**
 * Higgsfield keeps generated files for about seven days, so every asset the
 * seller may come back for is copied here on the way through.
 */
export async function putObject(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await db().storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** A time-limited URL the generation API can read the seller's photo from. */
export async function signedUrl(path: string, expiresInSeconds = 3_600): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function getObject(path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export function sourcePath(tgId: number, ext = "jpg"): string {
  return `${tgId}/source/${randomUUID()}.${ext}`;
}

export function outputPath(tgId: number, productId: string, card: string): string {
  return `${tgId}/cards/${productId}/${card}.jpg`;
}

/** Ensures the private bucket exists. Safe to call on every boot. */
export async function ensureBucket(): Promise<void> {
  const { data } = await db().storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db().storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
}

import sharp from "sharp";
import { CARDS, CARD_ORDER, ESTIMATED_COST_USD, type CardType } from "./cards.js";
import { buildPrompts } from "./prompts.js";
import { GenerationFailed, type ImageProvider } from "./provider.js";
import type { ProductBrief } from "./brief.js";
import { renderInfographic, CARD_HEIGHT, CARD_WIDTH } from "../render/infographic.js";
import { createJob, createProduct, finishJob, setProductCategory } from "../db/repo.js";
import { outputPath, putObject, signedUrl, sourcePath } from "../storage.js";

export type CardResult =
  | { card: CardType; ok: true; path: string; image: Buffer; costUsd: number }
  | { card: CardType; ok: false; reason: string; kind: string };

export type PackResult = {
  productId: string;
  results: CardResult[];
  costUsd: number;
  succeeded: number;
};

export type RunPackInput = {
  tgId: number;
  photo: Buffer;
  brief: ProductBrief;
  free: boolean;
  /** Only these card types are produced. The free sample is main only. */
  cards?: CardType[];
  onProgress?: (done: number, total: number) => void;
};

/**
 * One product in, one pack of finished cards out.
 * Each card is an independent job: one failure does not sink the others, and
 * the caller decides what a partial pack is worth.
 */
export async function runPack(provider: ImageProvider, input: RunPackInput): Promise<PackResult> {
  const cards = input.cards ?? CARD_ORDER;

  const srcPath = sourcePath(input.tgId);
  await putObject(srcPath, input.photo, "image/jpeg");
  const reference = await signedUrl(srcPath);

  const product = await createProduct({
    tgId: input.tgId,
    title: input.brief.title || null,
    priceUzs: input.brief.priceUzs,
    bullets: input.brief.bullets,
    sourcePath: srcPath,
    free: input.free,
  });

  const promptSet = await buildPrompts(input.brief);
  await setProductCategory(product.id, promptSet.category);

  let done = 0;
  const total = cards.length;

  const results = await Promise.all(
    cards.map(async (card): Promise<CardResult> => {
      const result = await runCard(provider, {
        card,
        productId: product.id,
        tgId: input.tgId,
        reference,
        prompt: promptSet.prompts[card],
        overlay: promptSet.overlay,
        brief: input.brief,
      });
      input.onProgress?.(++done, total);
      return result;
    }),
  );

  const ordered = cards.map((c) => results.find((r) => r.card === c)!).filter(Boolean);
  const succeeded = ordered.filter((r) => r.ok).length;
  const costUsd = ordered.reduce((sum, r) => sum + (r.ok ? r.costUsd : 0), 0);

  return { productId: product.id, results: ordered, costUsd, succeeded };
}

async function runCard(
  provider: ImageProvider,
  ctx: {
    card: CardType;
    productId: string;
    tgId: number;
    reference: string;
    prompt: string;
    overlay: { title: string; bullets: string[] };
    brief: ProductBrief;
  },
): Promise<CardResult> {
  const spec = CARDS[ctx.card];
  const job = await createJob(ctx.productId, ctx.card);

  let lastError: GenerationFailed | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const generated = await provider.generate({
        endpoint: spec.endpoint,
        prompt: ctx.prompt,
        referenceUrls: spec.needsProductReference ? [ctx.reference] : [],
        aspectRatio: spec.aspectRatio,
        resolution: spec.resolution,
        quality: spec.quality,
      });

      const raw = await download(generated.url);
      const image =
        spec.overlay === "infographic"
          ? await renderInfographic({
              background: raw,
              title: ctx.overlay.title,
              priceUzs: ctx.brief.priceUzs,
              bullets: ctx.overlay.bullets,
              lang: ctx.brief.lang,
            })
          : await normalize(raw);

      const path = outputPath(ctx.tgId, ctx.productId, ctx.card);
      await putObject(path, image, "image/jpeg");
      await finishJob(job.id, {
        status: "done",
        outputPath: path,
        costUsd: ESTIMATED_COST_USD,
        providerRequestId: generated.requestId,
        attempts: attempt,
      });

      return { card: ctx.card, ok: true, path, image, costUsd: ESTIMATED_COST_USD };
    } catch (err) {
      lastError =
        err instanceof GenerationFailed
          ? err
          : new GenerationFailed(err instanceof Error ? err.message : String(err), "unknown");
      if (!lastError.retryable) break;
    }
  }

  const reason = lastError?.message ?? "unknown error";
  const kind = lastError?.kind ?? "unknown";
  await finishJob(job.id, { status: "failed", error: `${kind}: ${reason}`, attempts: 2 });
  return { card: ctx.card, ok: false, reason, kind };
}

/** Marketplace spec: 3:4 portrait, at least 900x1200, sRGB JPEG. */
async function normalize(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: "attention" })
    .toColorspace("srgb")
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download result: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

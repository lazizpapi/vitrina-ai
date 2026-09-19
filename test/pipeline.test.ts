import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/** Storage and Postgres are stubbed; everything else is the real code path. */
const stored = new Map<string, Buffer>();
const jobs: Array<{ id: string; card: string; status?: string; error?: string | null; attempts?: number }> = [];

vi.mock("../src/storage.ts", () => ({
  putObject: async (path: string, body: Buffer) => {
    stored.set(path, body);
    return path;
  },
  signedUrl: async (path: string) => `https://storage.test/${path}?signed`,
  getObject: async (path: string) => stored.get(path)!,
  sourcePath: (tgId: number) => `${tgId}/source/fixed.jpg`,
  outputPath: (tgId: number, productId: string, card: string) => `${tgId}/cards/${productId}/${card}.jpg`,
  ensureBucket: async () => {},
}));

vi.mock("../src/db/repo.ts", () => ({
  createProduct: async () => ({ id: "product-1" }),
  setProductCategory: async () => {},
  createJob: async (_productId: string, card: string) => {
    const job = { id: `job-${jobs.length}`, card };
    jobs.push(job);
    return job;
  },
  finishJob: async (id: string, patch: Record<string, unknown>) => {
    const job = jobs.find((j) => j.id === id);
    if (job) Object.assign(job, patch);
  },
}));

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import type {
  GenerateRequest,
  GenerationFailed as GenerationFailedError,
  ImageProvider,
} from "../src/generation/provider.js";

const { runPack } = await import("../src/generation/pipeline.js");
const { GenerationFailed } = await import("../src/generation/provider.js");
const { CARD_ORDER } = await import("../src/generation/cards.js");

async function pixels(color: string): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 1200, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

/** Serves generated images over fetch, the way the real API does. */
function stubFetch(): void {
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const body = await pixels(String(url).includes("red") ? "#FF0000" : "#3366CC");
    return new Response(body, { status: 200 });
  });
}

class ScriptedProvider implements ImageProvider {
  readonly name = "scripted";
  readonly calls: GenerateRequest[] = [];

  constructor(private readonly behaviour: Record<string, "ok" | GenerationFailedError> = {}) {}

  async generate(req: GenerateRequest) {
    this.calls.push(req);
    const card = cardOf(req.prompt);
    const outcome = this.behaviour[card] ?? "ok";
    if (outcome !== "ok") throw outcome;
    return { url: `https://cdn.test/${card}.jpg`, requestId: `req-${card}` };
  }
}

/** The prompt carries the card's guidance, which is how the stub tells them apart. */
function cardOf(prompt: string): string {
  if (prompt.includes("upper third")) return "infographic";
  if (prompt.includes("holding or using")) return "model";
  if (prompt.includes("lifestyle scene")) return "lifestyle";
  return "main";
}

const brief = {
  title: "Termos Stanley 1.2 L",
  priceUzs: 349_000,
  bullets: ["24 soat issiq saqlaydi"],
  lang: "uz" as const,
};

beforeEach(async () => {
  stored.clear();
  jobs.length = 0;
  create.mockRejectedValue(new Error("offline")); // exercise the template fallback
  stubFetch();
});

describe("runPack", () => {
  it("produces four marketplace-spec cards in catalog order", async () => {
    const provider = new ScriptedProvider();

    const pack = await runPack(provider, {
      tgId: 42,
      photo: await pixels("#EEEEEE"),
      brief,
      free: false,
    });

    expect(pack.results.map((r) => r.card)).toEqual(CARD_ORDER);
    expect(pack.succeeded).toBe(4);

    for (const result of pack.results) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const meta = await sharp(result.image).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(1600);
      expect(stored.has(result.path)).toBe(true);
    }
  });

  it("sends the seller's own photo as a reference on every card", async () => {
    const provider = new ScriptedProvider();

    await runPack(provider, { tgId: 42, photo: await pixels("#EEEEEE"), brief, free: false });

    expect(provider.calls).toHaveLength(4);
    for (const call of provider.calls) {
      expect(call.referenceUrls).toEqual(["https://storage.test/42/source/fixed.jpg?signed"]);
      expect(call.aspectRatio).toBe("3:4");
      expect(call.prompt).toContain("No text");
    }
  });

  it("produces only the main card for the free sample", async () => {
    const provider = new ScriptedProvider();

    const pack = await runPack(provider, {
      tgId: 42,
      photo: await pixels("#EEEEEE"),
      brief,
      free: true,
      cards: ["main"],
    });

    expect(pack.results).toHaveLength(1);
    expect(pack.results[0]!.card).toBe("main");
    expect(provider.calls).toHaveLength(1);
  });

  it("keeps the cards that worked when one fails", async () => {
    const provider = new ScriptedProvider({
      model: new GenerationFailed("rejected by moderation", "nsfw"),
    });

    const pack = await runPack(provider, {
      tgId: 42,
      photo: await pixels("#EEEEEE"),
      brief,
      free: false,
    });

    expect(pack.succeeded).toBe(3);
    const failed = pack.results.find((r) => r.card === "model")!;
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.kind).toBe("nsfw");
    expect(jobs.find((j) => j.card === "model")!.status).toBe("failed");
  });

  it("retries a transient failure once and does not retry a rejected prompt", async () => {
    const transient = new ScriptedProvider({
      lifestyle: new GenerationFailed("upstream 502", "failed"),
      model: new GenerationFailed("bad input", "input"),
    });

    await runPack(transient, { tgId: 42, photo: await pixels("#EEEEEE"), brief, free: false });

    const attempts = (card: string) => transient.calls.filter((c) => cardOf(c.prompt) === card).length;
    expect(attempts("lifestyle")).toBe(2);
    expect(attempts("model")).toBe(1);
    expect(attempts("main")).toBe(1);
  });

  it("reports progress once per finished card", async () => {
    const seen: Array<[number, number]> = [];

    await runPack(new ScriptedProvider(), {
      tgId: 42,
      photo: await pixels("#EEEEEE"),
      brief,
      free: false,
      onProgress: (done, total) => seen.push([done, total]),
    });

    expect(seen).toHaveLength(4);
    expect(seen.map(([done]) => done).sort()).toEqual([1, 2, 3, 4]);
    expect(seen.every(([, total]) => total === 4)).toBe(true);
  });

  it("charges nothing for a pack where every card failed", async () => {
    const dead = new GenerationFailed("balance exhausted", "credits");
    const provider = new ScriptedProvider({
      main: dead,
      lifestyle: dead,
      model: dead,
      infographic: dead,
    });

    const pack = await runPack(provider, {
      tgId: 42,
      photo: await pixels("#EEEEEE"),
      brief,
      free: false,
    });

    expect(pack.succeeded).toBe(0);
    expect(pack.costUsd).toBe(0);
  });
});

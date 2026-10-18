import { randomUUID } from "node:crypto";
import { createHiggsfieldClient, type HiggsfieldClient } from "@higgsfield/client/v2";
import {
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
} from "@higgsfield/client";
import { config } from "../config.js";
import { GenerationFailed, type GenerateRequest, type GenerateResult, type ImageProvider } from "./provider.js";
import { Semaphore } from "./limit.js";

/** Builds a client whose every request carries the given idempotency key. */
export type ClientFactory = (idempotencyKey: string) => HiggsfieldClient;

const defaultFactory: ClientFactory = (idempotencyKey) =>
  createHiggsfieldClient({
    credentials: config.higgsfield.apiKey,
    baseURL: config.higgsfield.baseUrl,
    pollInterval: 2_000,
    maxPollTime: 180_000,
    headers: { "Idempotency-Key": idempotencyKey },
  });

export class HiggsfieldProvider implements ImageProvider {
  readonly name = "higgsfield";
  /**
   * The concurrency limit is per Higgsfield account, so one gate covers every
   * pack in the process. A request over the limit is rejected, not queued,
   * and the SDK does not retry it, so the queue has to live here.
   */
  private readonly gate: Semaphore;

  /**
   * One key per generation. The SDK retries a POST whose response was lost to
   * a timeout or a 5xx, and without a key that retry would start, and bill, a
   * second generation for one the server already accepted. The key rides on
   * the client because the SDK takes headers per client, not per request.
   */
  constructor(
    private readonly makeClient: ClientFactory = defaultFactory,
    concurrency: number = config.higgsfield.concurrency,
  ) {
    this.gate = new Semaphore(concurrency);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    let res;
    try {
      const client = this.makeClient(randomUUID());
      res = await this.gate.run(() => client.subscribe(req.endpoint, {
        withPolling: true,
        input: {
          prompt: req.prompt,
          image_urls: req.referenceUrls,
          aspect_ratio: req.aspectRatio,
          resolution: req.resolution,
          quality: req.quality,
        },
      }));
    } catch (err) {
      throw asGenerationFailed(err);
    }

    if (res.status === "nsfw") {
      throw new GenerationFailed("Request rejected by content moderation", "nsfw", res.request_id);
    }
    if (res.status !== "completed") {
      throw new GenerationFailed(`Generation ended with status ${res.status}`, "failed", res.request_id);
    }

    const url = res.images?.[0]?.url;
    if (!url) {
      throw new GenerationFailed("Generation completed without an image", "failed", res.request_id);
    }
    return { url, requestId: res.request_id };
  }
}

function asGenerationFailed(err: unknown): GenerationFailed {
  if (err instanceof GenerationFailed) return err;
  if (err instanceof NotEnoughCreditsError) {
    return new GenerationFailed("Higgsfield balance exhausted", "credits");
  }
  if (err instanceof AuthenticationError) {
    return new GenerationFailed("Higgsfield credentials rejected", "auth");
  }
  if (err instanceof ValidationError || err instanceof BadInputError) {
    return new GenerationFailed(err.message || "Request rejected by the API", "input");
  }
  if (err instanceof TimeoutError) {
    return new GenerationFailed("Generation timed out", "timeout");
  }
  return new GenerationFailed(err instanceof Error ? err.message : String(err), "unknown");
}

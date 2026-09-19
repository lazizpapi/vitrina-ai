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

export class HiggsfieldProvider implements ImageProvider {
  readonly name = "higgsfield";
  private readonly client: HiggsfieldClient;

  constructor(client?: HiggsfieldClient) {
    this.client =
      client ??
      createHiggsfieldClient({
        credentials: config.higgsfield.apiKey,
        baseURL: config.higgsfield.baseUrl,
        pollInterval: 2_000,
        maxPollTime: 180_000,
      });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    let res;
    try {
      res = await this.client.subscribe(req.endpoint, {
        withPolling: true,
        input: {
          prompt: req.prompt,
          image_urls: req.referenceUrls,
          aspect_ratio: req.aspectRatio,
          resolution: req.resolution,
          quality: req.quality,
        },
      });
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

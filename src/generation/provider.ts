/**
 * Seam between the pipeline and whichever generation API is behind it.
 * Today there is one implementation (Higgsfield). Adding fal.ai or Replicate
 * later means a second class here, not a change in the pipeline.
 */

export type GenerateRequest = {
  endpoint: string;
  prompt: string;
  /** Publicly reachable URLs of reference images. */
  referenceUrls: string[];
  aspectRatio: "3:4";
  resolution: "1k" | "2k" | "4k";
  quality: "low" | "medium" | "high";
};

export type GenerateResult = {
  url: string;
  requestId: string;
};

export class GenerationFailed extends Error {
  constructor(
    message: string,
    readonly kind: "nsfw" | "failed" | "timeout" | "auth" | "credits" | "input" | "unknown",
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "GenerationFailed";
  }

  /** Retrying a bad prompt or a missing key never helps. */
  get retryable(): boolean {
    return this.kind === "failed" || this.kind === "timeout" || this.kind === "unknown";
  }
}

export interface ImageProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

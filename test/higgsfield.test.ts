import { describe, expect, it } from "vitest";
import type { HiggsfieldClient } from "@higgsfield/client/v2";
import { HiggsfieldProvider } from "../src/generation/higgsfield.js";
import { Semaphore } from "../src/generation/limit.js";

const request = {
  endpoint: "marketing-studio/image",
  prompt: "studio shot",
  referenceUrls: ["https://storage.test/source.jpg"],
  aspectRatio: "3:4" as const,
  resolution: "2k" as const,
  quality: "high" as const,
};

/** A fake API that holds every request open until the test releases it. */
function heldClient() {
  let inFlight = 0;
  let peak = 0;
  const releases: Array<() => void> = [];

  const client = {
    async subscribe() {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => releases.push(resolve));
      inFlight--;
      return {
        status: "completed",
        request_id: `req-${peak}`,
        status_url: "",
        cancel_url: "",
        images: [{ url: "https://cdn.test/out.jpg" }],
      };
    },
  } as unknown as HiggsfieldClient;

  return {
    client,
    peak: () => peak,
    inFlight: () => inFlight,
    releaseOne: () => releases.shift()?.(),
    pending: () => releases.length,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("HiggsfieldProvider concurrency", () => {
  it("never runs more generations at once than the account allows", async () => {
    const api = heldClient();
    const provider = new HiggsfieldProvider(api.client, 2);

    const jobs = Array.from({ length: 4 }, () => provider.generate(request));
    await tick();
    expect(api.inFlight()).toBe(2);

    while (api.pending()) {
      api.releaseOne();
      await tick();
    }

    const results = await Promise.all(jobs);
    expect(results).toHaveLength(4);
    expect(api.peak()).toBe(2);
  });

  it("shares one limit across separate packs, because the limit is per account", async () => {
    const api = heldClient();
    const provider = new HiggsfieldProvider(api.client, 2);

    const sellerA = [provider.generate(request), provider.generate(request)];
    const sellerB = [provider.generate(request), provider.generate(request)];
    await tick();
    expect(api.inFlight()).toBe(2);

    while (api.pending()) {
      api.releaseOne();
      await tick();
    }
    await Promise.all([...sellerA, ...sellerB]);
    expect(api.peak()).toBe(2);
  });
});

describe("Semaphore", () => {
  it("hands a freed slot to the next waiter before a newcomer can take it", async () => {
    const gate = new Semaphore(1);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const work = () =>
      gate.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      });

    const first = work();
    const second = work();
    await tick();

    // Free the slot and, in the same turn, ask for it again. A naive
    // decrement-then-wake would let both the waiter and the newcomer in.
    releases.shift()!();
    const third = work();
    await tick();

    expect(active).toBe(1);
    while (releases.length) {
      releases.shift()!();
      await tick();
    }
    await Promise.all([first, second, third]);
    expect(peak).toBe(1);
  });

  it("releases its slot when the work throws", async () => {
    const gate = new Semaphore(1);
    await expect(gate.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(gate.run(async () => "after")).resolves.toBe("after");
  });

  it("refuses a limit below one", () => {
    expect(() => new Semaphore(0)).toThrow();
  });
});

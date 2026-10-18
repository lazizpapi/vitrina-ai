/**
 * Caps how many async jobs run at once.
 *
 * A freed slot is handed straight to the next waiter rather than released
 * and re-acquired. Releasing first would leave a gap in which a newcomer and
 * the woken waiter both get in, and the cap would be exceeded by one.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`Semaphore limit must be a positive integer, got ${max}`);
    }
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active < this.max) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

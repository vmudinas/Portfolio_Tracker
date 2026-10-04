type Sleep = (ms: number) => Promise<void>

/** Sliding-window limiter: at most `max` acquisitions per `windowMs`. */
export class RateLimiter {
  private stamps: number[] = []
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number
  private readonly sleep: Sleep

  constructor(
    max: number,
    windowMs: number,
    now: () => number = () => Date.now(),
    sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.max = max
    this.windowMs = windowMs
    this.now = now
    this.sleep = sleep
  }

  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now()
      this.stamps = this.stamps.filter((s) => t - s < this.windowMs)
      if (this.stamps.length < this.max) {
        this.stamps.push(t)
        return
      }
      await this.sleep(this.windowMs - (t - this.stamps[0]) + 5)
    }
  }
}

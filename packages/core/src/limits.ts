import { createHash } from "node:crypto";

type Waiter = () => void;

export class Semaphore {
  private active = 0;
  private readonly queue: Waiter[] = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release() {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }
}

export class HostRateLimiter {
  private readonly lastHit = new Map<string, number>();

  constructor(private readonly gapMs: number | (() => number)) {}

  async wait(host: string): Promise<void> {
    const gap = typeof this.gapMs === "function" ? this.gapMs() : this.gapMs;
    const now = Date.now();
    const last = this.lastHit.get(host) ?? 0;
    const wait = last + gap - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastHit.set(host, Date.now());
  }
}

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterS: number;
  resetAtMs: number;
  windowMs: number;
};

export function rateLimitConfigFromEnv(): RateLimitConfig {
  const rawLimit = Number(process.env.SITEAPI_RATE_LIMIT ?? 60);
  const rawWindow = Number(process.env.SITEAPI_RATE_WINDOW_S ?? 60);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 60;
  const windowS = Number.isFinite(rawWindow) ? Math.max(1, Math.trunc(rawWindow)) : 60;
  return { limit, windowMs: windowS * 1000 };
}

function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export class KeyRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: () => RateLimitConfig = rateLimitConfigFromEnv) {}

  take(key: string, now = Date.now()): RateLimitResult {
    const { limit, windowMs } = this.config();
    if (limit <= 0) {
      return { allowed: true, limit: 0, remaining: 0, retryAfterS: 0, resetAtMs: now, windowMs };
    }
    const id = fingerprint(key);
    const cutoff = now - windowMs;
    const prev = (this.hits.get(id) ?? []).filter((t) => t > cutoff);
    const oldest = prev[0] ?? now;
    const resetAtMs = oldest + windowMs;
    if (prev.length >= limit) {
      this.hits.set(id, prev);
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterS: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
        resetAtMs,
        windowMs,
      };
    }
    prev.push(now);
    this.hits.set(id, prev);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - prev.length),
      retryAfterS: Math.max(0, Math.ceil((prev[0] + windowMs - now) / 1000)),
      resetAtMs: prev[0] + windowMs,
      windowMs,
    };
  }

  reset(): void {
    this.hits.clear();
  }
}

export const keyRateLimiter = new KeyRateLimiter();

export function rateLimitHeaders(result: RateLimitResult, now = Date.now()): Headers {
  const headers = new Headers();
  if (result.limit <= 0) return headers;
  const resetS = Math.max(0, Math.ceil((result.resetAtMs - now) / 1000));
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(resetS));
  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterS));
  }
  return headers;
}

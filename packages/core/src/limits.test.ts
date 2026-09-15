import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyRateLimiter, rateLimitHeaders } from "./limits";

test("KeyRateLimiter allows up to the window limit then blocks", () => {
  const limiter = new KeyRateLimiter(() => ({ limit: 3, windowMs: 60_000 }));
  const t0 = 1_000_000;
  assert.equal(limiter.take("dev-key", t0).allowed, true);
  assert.equal(limiter.take("dev-key", t0 + 10).allowed, true);
  const lastOk = limiter.take("dev-key", t0 + 20);
  assert.equal(lastOk.allowed, true);
  assert.equal(lastOk.remaining, 0);
  const blocked = limiter.take("dev-key", t0 + 30);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterS, Math.ceil((t0 + 60_000 - (t0 + 30)) / 1000));
});

test("KeyRateLimiter keys independently and recovers after the window", () => {
  const limiter = new KeyRateLimiter(() => ({ limit: 1, windowMs: 1_000 }));
  const t0 = 5_000;
  assert.equal(limiter.take("a", t0).allowed, true);
  assert.equal(limiter.take("a", t0 + 10).allowed, false);
  assert.equal(limiter.take("b", t0 + 10).allowed, true);
  assert.equal(limiter.take("a", t0 + 1_001).allowed, true);
});

test("limit 0 disables the limiter", () => {
  const limiter = new KeyRateLimiter(() => ({ limit: 0, windowMs: 60_000 }));
  for (let i = 0; i < 20; i += 1) {
    assert.equal(limiter.take("dev-key", i).allowed, true);
  }
});

test("rateLimitHeaders set Retry-After only when blocked", () => {
  const ok = rateLimitHeaders(
    { allowed: true, limit: 60, remaining: 59, retryAfterS: 60, resetAtMs: 2_000, windowMs: 60_000 },
    1_000,
  );
  assert.equal(ok.get("RateLimit-Limit"), "60");
  assert.equal(ok.get("RateLimit-Remaining"), "59");
  assert.equal(ok.get("RateLimit-Reset"), "1");
  assert.equal(ok.get("Retry-After"), null);

  const blocked = rateLimitHeaders(
    { allowed: false, limit: 60, remaining: 0, retryAfterS: 12, resetAtMs: 13_000, windowMs: 60_000 },
    1_000,
  );
  assert.equal(blocked.get("Retry-After"), "12");
  assert.equal(blocked.get("RateLimit-Remaining"), "0");
});

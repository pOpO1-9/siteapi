import { timingSafeEqual } from "node:crypto";
import {
  SiteApiError,
  asSiteApiError,
  httpStatusFor,
  keyRateLimiter,
  rateLimitHeaders,
} from "@siteapi/core";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireSiteApiKey(req: Request): string {
  const expected = process.env.SITEAPI_API_KEY?.trim();
  if (!expected) {
    throw new SiteApiError("unauthorized", "SITEAPI_API_KEY is not configured on the server.");
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = /^bearer /i.test(header) ? header.slice(7).trim() : "";
  const alt = req.headers.get("x-api-key")?.trim() ?? "";
  const got = bearer || alt;
  if (!got || !safeEqual(got, expected)) {
    throw new SiteApiError(
      "unauthorized",
      "Valid SITEAPI_API_KEY required. Pass Authorization: Bearer <key>. This is SiteAPI's key, not your LLM key.",
    );
  }
  return got;
}

/** Auth + per-key quota for published /v1 routes. UI and /api/health are not gated. */
export function protectPublished(req: Request): Headers {
  const key = requireSiteApiKey(req);
  const result = keyRateLimiter.take(key);
  const headers = rateLimitHeaders(result);
  if (!result.allowed) {
    throw new SiteApiError(
      "rate_limited",
      `Rate limit exceeded: ${result.limit} requests per ${Math.round(result.windowMs / 1000)}s per SITEAPI_API_KEY.`,
      {
        retry_after_s: result.retryAfterS,
        limit: result.limit,
        remaining: 0,
        window_s: Math.round(result.windowMs / 1000),
      },
    );
  }
  return headers;
}

export function v1Error(err: unknown, extra?: Headers): Response {
  const mapped = asSiteApiError(err);
  const headers = new Headers(extra);
  if (mapped.code === "rate_limited") {
    const retry = mapped.details.retry_after_s;
    if (typeof retry === "number" && Number.isFinite(retry)) {
      headers.set("Retry-After", String(Math.max(1, Math.ceil(retry))));
    }
    if (typeof mapped.details.limit === "number") {
      headers.set("RateLimit-Limit", String(mapped.details.limit));
    }
    headers.set("RateLimit-Remaining", "0");
    if (typeof retry === "number" && Number.isFinite(retry)) {
      headers.set("RateLimit-Reset", String(Math.max(1, Math.ceil(retry))));
    }
  }
  return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code), headers });
}

export function v1Json(body: unknown, status: number, extra: Headers): Response {
  return Response.json(body, { status, headers: extra });
}

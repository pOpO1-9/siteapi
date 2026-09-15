export type SiteApiErrorCode =
  | "invalid_url"
  | "unsupported_scheme"
  | "private_host"
  | "bot_trap"
  | "robots_disallowed"
  | "timeout"
  | "blocked"
  | "auth_protected"
  | "empty"
  | "too_large"
  | "fetch_failed"
  | "missing_api_key"
  | "llm_failed"
  | "schema_mismatch"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "rate_limited";

export class SiteApiError extends Error {
  readonly code: SiteApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: SiteApiErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "SiteApiError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function asSiteApiError(err: unknown): SiteApiError {
  if (err instanceof SiteApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || /timeout/i.test(message)) {
    return new SiteApiError("timeout", "Request timed out.", { cause: message });
  }
  return new SiteApiError("fetch_failed", "Request failed.", { cause: message });
}

const STATUS: Record<SiteApiErrorCode, number> = {
  invalid_url: 400,
  unsupported_scheme: 400,
  private_host: 400,
  bot_trap: 403,
  robots_disallowed: 403,
  blocked: 403,
  auth_protected: 401,
  missing_api_key: 401,
  timeout: 504,
  too_large: 413,
  empty: 422,
  schema_mismatch: 422,
  fetch_failed: 502,
  llm_failed: 502,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

export function httpStatusFor(code: SiteApiErrorCode): number {
  return STATUS[code] ?? 502;
}

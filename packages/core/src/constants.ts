export const SITEAPI_VERSION = "0.1.0";
export const SITEAPI_USER_AGENT = "SiteAPI/0.1 (+https://github.com/pOpO1-9/siteapi)";
export const EXTRACTOR_VERSION = `capture-${SITEAPI_VERSION}`;
export const EXTRACT_PIPELINE_VERSION = `extract-${SITEAPI_VERSION}`;
export const DEFAULT_EXTRACT_PROMPT =
  "top stories with rank, title, points, comment count, url";
export const MAX_INFER_MARKDOWN_CHARS = 24_000;
export const MAX_EXTRACT_MARKDOWN_CHARS = 40_000;
export const MAX_EXTRACT_A11Y_CHARS = 12_000;

export const MAX_HTML_BYTES = 2_000_000;
export const DEFAULT_BROWSER_TIMEOUT_MS = 20_000;
export const DEFAULT_HOST_GAP_MS = 1_000;
export const DEFAULT_CAPTURE_CONCURRENCY = 2;
export const MIN_MARKDOWN_CHARS = 40;
export const DEFAULT_CACHE_TTL_S = 60;
export const MIN_CACHE_TTL_S = 5;
export const MAX_CACHE_TTL_S = 3600;
export const DEFAULT_REFRESH_WAIT_MS = 15_000;

export const LLM_MISSING_MESSAGE =
  "No LLM configured. Point OPENAI_BASE_URL at Ollama (http://127.0.0.1:11434/v1) or any OpenAI-compatible server, set OPENAI_API_KEY (use \"ollama\" for local), and set OPENAI_MODEL.";

export function cacheTtlSeconds(raw?: number): number {
  const env = Number(process.env.CACHE_TTL_S ?? DEFAULT_CACHE_TTL_S);
  const n = raw ?? (Number.isFinite(env) ? env : DEFAULT_CACHE_TTL_S);
  if (!Number.isFinite(n)) return DEFAULT_CACHE_TTL_S;
  return Math.min(MAX_CACHE_TTL_S, Math.max(MIN_CACHE_TTL_S, Math.trunc(n)));
}

export function refreshWaitMs(): number {
  const n = Number(process.env.REFRESH_WAIT_MS ?? DEFAULT_REFRESH_WAIT_MS);
  if (!Number.isFinite(n)) return DEFAULT_REFRESH_WAIT_MS;
  return Math.min(120_000, Math.max(1_000, Math.trunc(n)));
}

export function dbFilePath(): string {
  if (process.env.SITEAPI_DB_PATH?.trim()) return process.env.SITEAPI_DB_PATH.trim();
  return `${process.cwd()}/data/siteapi.db`;
}

export function browserTimeoutMs(): number {
  const n = Number(process.env.BROWSER_TIMEOUT_MS ?? DEFAULT_BROWSER_TIMEOUT_MS);
  if (!Number.isFinite(n)) return DEFAULT_BROWSER_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(n), 3_000), 60_000);
}

export function captureConcurrency(): number {
  const n = Number(process.env.CAPTURE_CONCURRENCY ?? DEFAULT_CAPTURE_CONCURRENCY);
  if (!Number.isFinite(n)) return DEFAULT_CAPTURE_CONCURRENCY;
  return Math.min(Math.max(Math.trunc(n), 1), 4);
}

export function ignoreRobotsFromEnv(): boolean {
  return process.env.SITEAPI_IGNORE_ROBOTS === "1";
}

export function hostGapMs(): number {
  const n = Number(process.env.HOST_GAP_MS ?? DEFAULT_HOST_GAP_MS);
  if (!Number.isFinite(n)) return DEFAULT_HOST_GAP_MS;
  return Math.min(10_000, Math.max(0, Math.trunc(n)));
}

export function healthPayload() {
  return {
    ok: true as const,
    service: "siteapi",
    version: SITEAPI_VERSION,
    mvp: "complete" as const,
    user_agent: SITEAPI_USER_AGENT,
    timestamp: new Date().toISOString(),
  };
}

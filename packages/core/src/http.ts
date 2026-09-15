import { SITEAPI_USER_AGENT, hostGapMs } from "./constants";
import { SiteApiError } from "./errors";
import { HostRateLimiter } from "./limits";

const hostLimiter = new HostRateLimiter(hostGapMs);

export type ExternalResponse = {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
};

/** Single outbound HTTP client for non-browser fetches (robots.txt, etc). */
export async function fetchExternal(
  url: string,
  opts: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  } = {},
): Promise<ExternalResponse> {
  const parsed = new URL(url);
  await hostLimiter.wait(parsed.host);

  const timeoutMs = opts.timeoutMs ?? 10_000;
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      body: opts.body,
      headers: {
        "user-agent": SITEAPI_USER_AGENT,
        accept: "text/plain,text/html,*/*;q=0.8",
        ...opts.headers,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(message)) {
      throw new SiteApiError("timeout", "Timed out fetching URL.", { url });
    }
    throw new SiteApiError("fetch_failed", "HTTP fetch failed.", { url, cause: message });
  }

  const body = await res.text();
  return {
    url: res.url || url,
    status: res.status,
    headers: res.headers,
    body,
    bytes: Buffer.byteLength(body),
  };
}

export { hostLimiter };

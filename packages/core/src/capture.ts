import {
  EXTRACTOR_VERSION,
  MAX_HTML_BYTES,
  MIN_MARKDOWN_CHARS,
  SITEAPI_USER_AGENT,
  browserTimeoutMs,
  captureConcurrency,
} from "./constants";
import { SiteApiError, asSiteApiError } from "./errors";
import { htmlToMarkdown } from "./html-to-markdown";
import { hostLimiter } from "./http";
import { Semaphore } from "./limits";
import { checkRobots } from "./robots";
import { parsePublicHttpUrl } from "./url-guard";

import type { Browser, Page } from "playwright";

export type CaptureOk = {
  ok: true;
  url: string;
  final_url: string;
  status: number;
  title: string;
  html: string;
  markdown: string;
  accessibility: string;
  bytes: number;
  duration_ms: number;
  fetched_at: string;
  extractor_version: string;
  warnings: string[];
};

export type CaptureOptions = {
  ignoreRobots?: boolean;
};

const captureLock = new Semaphore(captureConcurrency());
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage"],
      });
    })().catch((err: unknown) => {
      browserPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new SiteApiError(
        "fetch_failed",
        "Playwright Chromium is not available. Run: npx playwright install chromium",
        { cause: message },
      );
    });
  }
  return browserPromise;
}

function looksLikeChallenge(title: string, html: string, status: number): boolean {
  if (status === 403) return true;
  const head = `${title}\n${html.slice(0, 24_000)}`.toLowerCase();
  if (/just a moment/.test(head)) return true;
  if (/attention required! \| cloudflare/.test(head)) return true;
  if (head.includes("cf-browser-verification") || head.includes("cdn-cgi/challenge")) return true;
  if (head.includes("enable javascript and cookies to continue")) return true;
  return false;
}

async function looksLikeLoginWall(page: Page, finalUrl: string, title: string): Promise<boolean> {
  const path = new URL(finalUrl).pathname.toLowerCase();
  if (/\/(login|log-in|signin|sign-in|account\/login)(?:\/|$)/.test(path)) return true;
  const passwordCount = await page.locator('input[type="password"]').count();
  if (passwordCount > 0 && /sign in|log in|login|signin/i.test(title)) return true;
  return false;
}

async function accessibilitySnapshot(page: Page): Promise<string> {
  try {
    return await page.locator("body").ariaSnapshot();
  } catch {
    try {
      const snap = await page.accessibility.snapshot();
      return JSON.stringify(snap ?? {}, null, 2);
    } catch {
      return "";
    }
  }
}

export function logFetch(entry: {
  url: string;
  status: number;
  duration_ms: number;
  bytes: number;
  extractor_version: string;
  error?: string;
}) {
  console.info(JSON.stringify({ evt: "siteapi.fetch", ...entry }));
}

async function captureOnce(target: URL, options: CaptureOptions): Promise<CaptureOk> {
  const started = Date.now();
  const warnings: string[] = [];
  const timeout = browserTimeoutMs();

  const robots = await checkRobots(target, Boolean(options.ignoreRobots));
  if (robots.warning) warnings.push(robots.warning);
  if (!robots.allowed) {
    throw new SiteApiError("robots_disallowed", "robots.txt disallows this URL for SiteAPI.", {
      url: target.href,
      robots: robots.source,
    });
  }

  await hostLimiter.wait(target.host);

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: SITEAPI_USER_AGENT,
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
    javaScriptEnabled: true,
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();

  let status = 0;
  let finalUrl = target.href;

  try {
    const response = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    status = response?.status() ?? 0;
    finalUrl = page.url();

    if (status === 401) {
      throw new SiteApiError("auth_protected", "Auth-protected pages are not supported yet.", {
        status,
        url: finalUrl,
      });
    }

    await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 8_000) }).catch(() => {
      warnings.push("networkidle wait skipped; using DOM as captured");
    });

    const html = await page.content();
    const bytes = Buffer.byteLength(html);
    const title = await page.title();

    if (looksLikeChallenge(title, html, status)) {
      throw new SiteApiError("blocked", "Site blocked the request (403/challenge).", {
        status,
        url: finalUrl,
        title,
      });
    }

    if (await looksLikeLoginWall(page, finalUrl, title)) {
      throw new SiteApiError("auth_protected", "Auth-protected pages are not supported yet.", {
        status,
        url: finalUrl,
        title,
      });
    }

    if (bytes > MAX_HTML_BYTES) {
      throw new SiteApiError("too_large", "Rendered HTML exceeds the 2MB capture limit.", {
        bytes,
        max: MAX_HTML_BYTES,
      });
    }

    const markdown = htmlToMarkdown(html);
    if (markdown.length < MIN_MARKDOWN_CHARS) {
      throw new SiteApiError("empty", "Page rendered but no usable content was extracted.", {
        status,
        url: finalUrl,
        markdown_chars: markdown.length,
      });
    }

    const accessibility = await accessibilitySnapshot(page);
    const duration_ms = Date.now() - started;
    const result: CaptureOk = {
      ok: true,
      url: target.href,
      final_url: finalUrl,
      status,
      title,
      html,
      markdown,
      accessibility,
      bytes,
      duration_ms,
      fetched_at: new Date().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      warnings,
    };

    logFetch({
      url: result.final_url,
      status: result.status,
      duration_ms,
      bytes,
      extractor_version: EXTRACTOR_VERSION,
    });

    return result;
  } catch (err) {
    const mapped = asSiteApiError(err);
    logFetch({
      url: finalUrl,
      status,
      duration_ms: Date.now() - started,
      bytes: 0,
      extractor_version: EXTRACTOR_VERSION,
      error: mapped.code,
    });
    throw mapped;
  } finally {
    await context.close().catch(() => {});
  }
}

export async function capturePage(rawUrl: string, options: CaptureOptions = {}): Promise<CaptureOk> {
  const target = parsePublicHttpUrl(rawUrl);
  return captureLock.run(() => captureOnce(target, options));
}

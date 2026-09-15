import { SiteApiError } from "./errors";

const BOT_TRAP_PATTERNS = [
  /\/wp-admin(?:\/|$)/i,
  /\/wp-login\.php/i,
  /\/xmlrpc\.php/i,
  /\/phpmyadmin(?:\/|$)/i,
  /\/adminer\.php/i,
  /\/cgi-bin(?:\/|$)/i,
  /\/\.git(?:\/|$)/i,
  /\/\.env(?:$|\?)/i,
  /\/honeypot(?:\/|$)/i,
  /\/cdn-cgi\/challenge/i,
];

const PRIVATE_V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parsePublicHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SiteApiError("invalid_url", "A URL is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SiteApiError("invalid_url", "That is not a valid URL.", { url: trimmed });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SiteApiError("unsupported_scheme", "Only http and https URLs are allowed.", {
      protocol: url.protocol,
    });
  }

  if (url.username || url.password) {
    throw new SiteApiError("auth_protected", "Auth-protected pages are not supported yet.");
  }

  if (isPrivateHostname(url.hostname)) {
    throw new SiteApiError("private_host", "Only public pages are allowed in MVP.", {
      host: url.hostname,
    });
  }

  if (BOT_TRAP_PATTERNS.some((re) => re.test(url.pathname))) {
    throw new SiteApiError("bot_trap", "Refusing to fetch a bot-trap or admin path.", {
      path: url.pathname,
    });
  }

  return url;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const m = PRIVATE_V4.exec(host);
  if (!m) return false;
  const oct = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (oct.some((n) => n > 255)) return true;
  if (oct[0] === 0 || oct[0] === 10 || oct[0] === 127) return true;
  if (oct[0] === 169 && oct[1] === 254) return true;
  if (oct[0] === 192 && oct[1] === 168) return true;
  if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return true;
  return false;
}

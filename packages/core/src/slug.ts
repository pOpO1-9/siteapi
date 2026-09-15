import { SiteApiError } from "./errors";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug;
}

export function defaultSlug(url: string, prompt: string, requested?: string): string {
  if (requested?.trim()) {
    const s = slugify(requested.trim());
    if (!SLUG_RE.test(s)) {
      throw new SiteApiError("invalid_url", "Slug must be lowercase letters, numbers, and hyphens.", { slug: requested });
    }
    return s;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "news.ycombinator.com") return "hn-top-stories";
  } catch {
    /* ignore */
  }
  return slugify(prompt) || slugify(url) || "source";
}

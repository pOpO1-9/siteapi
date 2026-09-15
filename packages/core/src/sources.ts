import { desc, eq } from "drizzle-orm";
import { cacheTtlSeconds, refreshWaitMs } from "./constants";
import { type SiteApiDb, getDb } from "./db";
import { type SourceRow, sources } from "./db-schema";
import { SiteApiError, asSiteApiError } from "./errors";
import { extractPage, type ExtractResult, type JsonSchema } from "./extract";
import { openApiDocument, type OpenApiDocument } from "./openapi";
import { defaultSlug } from "./slug";

export type ExtractFn = typeof extractPage;

export type EndpointEnvelope = {
  ok: true;
  fetched_at: string;
  cache_ttl_s: number;
  source_url: string;
  data: unknown;
  warnings: string[];
};

export type ServeResult = {
  envelope: EndpointEnvelope;
  status: 200 | 202;
  from_cache: boolean;
};

const inflight = new Map<string, Promise<void>>();

export function isCacheFresh(row: SourceRow, now = Date.now()): boolean {
  if (!row.cachedFetchedAt || !row.cachedPayloadJson) return false;
  const fetched = Date.parse(row.cachedFetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return now - fetched < row.cacheTtlS * 1000;
}

function envelopeOf(row: SourceRow, extraWarnings: string[] = []): EndpointEnvelope {
  if (!row.cachedPayloadJson || !row.cachedFetchedAt) {
    throw new SiteApiError("empty", "Source has no cached payload yet.", { slug: row.slug });
  }
  const stored = JSON.parse(row.warningsJson ?? "[]") as unknown;
  const warnings = Array.isArray(stored) ? stored.map(String) : [];
  return {
    ok: true,
    fetched_at: row.cachedFetchedAt,
    cache_ttl_s: row.cacheTtlS,
    source_url: row.url,
    data: JSON.parse(row.cachedPayloadJson) as unknown,
    warnings: [...warnings, ...extraWarnings],
  };
}

async function load(db: SiteApiDb, slug: string): Promise<SourceRow> {
  const rows = db.select().from(sources).where(eq(sources.slug, slug)).all();
  const row = rows[0];
  if (!row) {
    throw new SiteApiError("not_found", "No source for that slug.", { slug });
  }
  return row;
}

function persistSuccess(db: SiteApiDb, slug: string, extracted: ExtractResult, keepSample: string | null) {
  const payload = JSON.stringify(extracted.data);
  db.update(sources)
    .set({
      schemaJson: JSON.stringify(extracted.schema),
      instructions: extracted.instructions,
      samplePayloadJson: keepSample ?? payload,
      cachedPayloadJson: payload,
      cachedFetchedAt: extracted.fetched_at,
      cacheMarkdownHash: extracted.markdown_hash,
      lastSuccessAt: extracted.fetched_at,
      lastError: null,
      promptVersion: extracted.prompt_version,
      extractorVersion: extracted.extractor_version,
      warningsJson: JSON.stringify(extracted.warnings),
      lastDurationMs: extracted.capture_ms + extracted.extract_ms,
    })
    .where(eq(sources.slug, slug))
    .run();
}

function persistError(db: SiteApiDb, slug: string, err: unknown) {
  const mapped = asSiteApiError(err);
  db.update(sources)
    .set({ lastError: `${mapped.code}: ${mapped.message}` })
    .where(eq(sources.slug, slug))
    .run();
}

async function refreshSource(db: SiteApiDb, row: SourceRow, extract: ExtractFn): Promise<void> {
  try {
    const schema = JSON.parse(row.schemaJson) as JsonSchema;
    let cachedData: unknown;
    try {
      cachedData = row.cachedPayloadJson ? JSON.parse(row.cachedPayloadJson) : undefined;
    } catch {
      cachedData = undefined;
    }
    const extracted = await extract({
      url: row.url,
      prompt: row.prompt,
      schema,
      instructions: row.instructions,
      reuseIfHash: row.cacheMarkdownHash ?? undefined,
      reuseData: cachedData,
    });
    persistSuccess(db, row.slug, extracted, row.samplePayloadJson);
  } catch (err) {
    persistError(db, row.slug, err);
    throw err;
  }
}

function waitFor(promise: Promise<void>, ms: number): Promise<"done" | "timeout"> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    promise.then(
      () => {
        clearTimeout(t);
        resolve("done");
      },
      () => {
        clearTimeout(t);
        resolve("done");
      },
    );
  });
}

export async function createSource(
  input: {
    url: string;
    prompt: string;
    slug?: string;
    cache_ttl_s?: number;
    schema?: JsonSchema;
  },
  opts: { db?: SiteApiDb; extract?: ExtractFn } = {},
): Promise<{ slug: string; envelope: EndpointEnvelope; schema: JsonSchema; instructions: string }> {
  const db = opts.db ?? getDb();
  const extract = opts.extract ?? extractPage;
  const slug = defaultSlug(input.url, input.prompt, input.slug);
  const existing = db.select().from(sources).where(eq(sources.slug, slug)).all()[0];
  if (existing) {
    throw new SiteApiError("conflict", "That slug is already published.", { slug });
  }

  const extracted = await extract({
    url: input.url,
    prompt: input.prompt,
    schema: input.schema,
    instructions: input.schema ? "" : undefined,
  });
  const now = new Date().toISOString();
  const ttl = cacheTtlSeconds(input.cache_ttl_s);
  const payload = JSON.stringify(extracted.data);

  db.insert(sources)
    .values({
      slug,
      url: extracted.source_url || input.url,
      prompt: extracted.prompt,
      schemaJson: JSON.stringify(extracted.schema),
      instructions: extracted.instructions,
      cacheTtlS: ttl,
      samplePayloadJson: payload,
      cachedPayloadJson: payload,
      cachedFetchedAt: extracted.fetched_at,
      cacheMarkdownHash: extracted.markdown_hash,
      createdAt: now,
      lastSuccessAt: extracted.fetched_at,
      lastError: null,
      promptVersion: extracted.prompt_version,
      extractorVersion: extracted.extractor_version,
      warningsJson: JSON.stringify(extracted.warnings),
      lastDurationMs: extracted.capture_ms + extracted.extract_ms,
      published: 1,
    })
    .run();

  const row = await load(db, slug);
  return {
    slug,
    envelope: envelopeOf(row),
    schema: extracted.schema,
    instructions: extracted.instructions,
  };
}

export async function serveEndpoint(
  slug: string,
  opts: { fresh?: boolean; db?: SiteApiDb; extract?: ExtractFn } = {},
): Promise<ServeResult> {
  const db = opts.db ?? getDb();
  const extract = opts.extract ?? extractPage;
  const row = await load(db, slug);
  if (row.published === 0) {
    throw new SiteApiError("not_found", "Source is unpublished.", { slug });
  }

  if (!opts.fresh && isCacheFresh(row)) {
    return { envelope: envelopeOf(row), status: 200, from_cache: true };
  }

  let pending = inflight.get(slug);
  if (!pending) {
    pending = refreshSource(db, row, extract).finally(() => inflight.delete(slug));
    inflight.set(slug, pending);
  }

  const outcome = await waitFor(pending, refreshWaitMs());
  const latest = await load(db, slug);

  if (outcome === "timeout") {
    if (latest.cachedPayloadJson) {
      return {
        envelope: envelopeOf(latest, ["refresh still running; returning last-known data"]),
        status: 202,
        from_cache: true,
      };
    }
    throw new SiteApiError("timeout", "Refresh did not finish in time and no cached payload exists yet.", { slug });
  }

  if (latest.lastError && !latest.cachedPayloadJson) {
    throw new SiteApiError("fetch_failed", latest.lastError, { slug });
  }

  if (latest.lastError && latest.cachedPayloadJson) {
    return {
      envelope: envelopeOf(latest, [`refresh failed: ${latest.lastError}`]),
      status: 202,
      from_cache: true,
    };
  }

  return { envelope: envelopeOf(latest), status: 200, from_cache: false };
}

export async function sourceSchema(slug: string, db: SiteApiDb = getDb()) {
  const row = await load(db, slug);
  if (row.published === 0) {
    throw new SiteApiError("not_found", "Source is unpublished.", { slug });
  }
  return {
    ok: true as const,
    slug: row.slug,
    source_url: row.url,
    prompt: row.prompt,
    schema: JSON.parse(row.schemaJson) as JsonSchema,
    instructions: row.instructions,
    cache_ttl_s: row.cacheTtlS,
    created_at: row.createdAt,
    last_success_at: row.lastSuccessAt,
    last_error: row.lastError,
  };
}

export async function sourceOpenApi(
  slug: string,
  origin = "http://localhost:3000",
  db: SiteApiDb = getDb(),
): Promise<OpenApiDocument> {
  const meta = await sourceSchema(slug, db);
  return openApiDocument({
    slug: meta.slug,
    source_url: meta.source_url,
    prompt: meta.prompt,
    schema: meta.schema,
    cache_ttl_s: meta.cache_ttl_s,
    origin,
  });
}

export function listSources(db: SiteApiDb = getDb()) {
  return db.select().from(sources).orderBy(desc(sources.createdAt)).all().map((row) => ({
    slug: row.slug,
    url: row.url,
    prompt: row.prompt,
    published: row.published !== 0,
    cache_ttl_s: row.cacheTtlS,
    last_success_at: row.lastSuccessAt,
    last_error: row.lastError,
    last_duration_ms: row.lastDurationMs,
    fetched_at: row.cachedFetchedAt,
  }));
}

export function getStudioSource(slug: string, db: SiteApiDb = getDb()) {
  const rows = db.select().from(sources).where(eq(sources.slug, slug)).all();
  const row = rows[0];
  if (!row) {
    throw new SiteApiError("not_found", "No source for that slug.", { slug });
  }
  return {
    slug: row.slug,
    url: row.url,
    prompt: row.prompt,
    schema: JSON.parse(row.schemaJson) as JsonSchema,
    instructions: row.instructions,
    cache_ttl_s: row.cacheTtlS,
    published: row.published !== 0,
    last_success_at: row.lastSuccessAt,
    last_error: row.lastError,
    last_duration_ms: row.lastDurationMs,
    envelope: row.cachedPayloadJson && row.cachedFetchedAt ? envelopeOf(row) : null,
  };
}

export function setPublished(slug: string, published: boolean, db: SiteApiDb = getDb()) {
  const row = db.select().from(sources).where(eq(sources.slug, slug)).all()[0];
  if (!row) throw new SiteApiError("not_found", "No source for that slug.", { slug });
  db.update(sources)
    .set({ published: published ? 1 : 0 })
    .where(eq(sources.slug, slug))
    .run();
  return getStudioSource(slug, db);
}

export function setCacheTtl(slug: string, cache_ttl_s: number, db: SiteApiDb = getDb()) {
  const row = db.select().from(sources).where(eq(sources.slug, slug)).all()[0];
  if (!row) throw new SiteApiError("not_found", "No source for that slug.", { slug });
  db.update(sources)
    .set({ cacheTtlS: cacheTtlSeconds(cache_ttl_s) })
    .where(eq(sources.slug, slug))
    .run();
  return getStudioSource(slug, db);
}

export async function reextractSource(
  slug: string,
  input: { schema?: JsonSchema; cache_ttl_s?: number } = {},
  opts: { db?: SiteApiDb; extract?: ExtractFn } = {},
) {
  const db = opts.db ?? getDb();
  const extract = opts.extract ?? extractPage;
  const row = await load(db, slug);
  if (input.cache_ttl_s != null) {
    db.update(sources)
      .set({ cacheTtlS: cacheTtlSeconds(input.cache_ttl_s) })
      .where(eq(sources.slug, slug))
      .run();
  }
  const nextSchema = input.schema ?? (JSON.parse(row.schemaJson) as JsonSchema);
  const schemaChanged = Boolean(input.schema);
  let cachedData: unknown;
  try {
    cachedData = row.cachedPayloadJson ? JSON.parse(row.cachedPayloadJson) : undefined;
  } catch {
    cachedData = undefined;
  }
  try {
    const extracted = await extract({
      url: row.url,
      prompt: row.prompt,
      schema: nextSchema,
      instructions: schemaChanged ? "" : row.instructions,
      reuseIfHash: schemaChanged ? undefined : (row.cacheMarkdownHash ?? undefined),
      reuseData: schemaChanged ? undefined : cachedData,
    });
    persistSuccess(db, slug, extracted, row.samplePayloadJson);
  } catch (err) {
    persistError(db, slug, err);
    throw err;
  }
  return getStudioSource(slug, db);
}

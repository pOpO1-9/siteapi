import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "./db";
import type { ExtractResult } from "./extract";
import { createSource, isCacheFresh, listSources, serveEndpoint, sourceSchema, type ExtractFn } from "./sources";
import type { SourceRow } from "./db-schema";

function fakeExtract(data: unknown, hash = "hash-1"): ExtractFn {
  let calls = 0;
  const fn: ExtractFn = async (opts) => {
    calls += 1;
    if (opts.reuseIfHash && opts.reuseIfHash === hash && opts.reuseData !== undefined) {
      return result(opts.reuseData, hash, true);
    }
    return result(data, hash, false);
  };
  Object.defineProperty(fn, "calls", { get: () => calls });
  return fn;
}

function result(data: unknown, hash: string, reused: boolean): ExtractResult {
  const fetched_at = new Date().toISOString();
  return {
    ok: true,
    source_url: "https://news.ycombinator.com/",
    final_url: "https://news.ycombinator.com/",
    prompt: "top stories with rank, title, points, comment count, url",
    schema: {
      type: "object",
      required: ["stories"],
      properties: { stories: { type: "array" } },
    },
    instructions: "treat discuss as 0",
    data,
    warnings: [],
    retried: false,
    fetched_at,
    prompt_version: "v1",
    extractor_version: "extract-0.1.0",
    capture_ms: 1,
    extract_ms: reused ? 0 : 2,
    markdown_hash: hash,
    reused,
  };
}

function payload() {
  return {
    stories: [
      {
        rank: 1,
        title: "Java 27 Released",
        points: 183,
        comments: 132,
        url: "https://openjdk.org/",
      },
    ],
  };
}

test("isCacheFresh honors TTL", () => {
  const row = {
    cachedFetchedAt: new Date(Date.now() - 10_000).toISOString(),
    cachedPayloadJson: "{}",
    cacheTtlS: 60,
  } as SourceRow;
  assert.equal(isCacheFresh(row), true);
  assert.equal(isCacheFresh({ ...row, cacheTtlS: 5 }), false);
});

test("create then GET serves SQLite cache without a second extract", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "siteapi-")), "test.db");
  const db = openDb(file);
  const extract = fakeExtract(payload());
  const created = await createSource(
    {
      url: "https://news.ycombinator.com",
      prompt: "top stories with rank, title, points, comment count, url",
      slug: "hn-top-stories",
    },
    { db, extract },
  );
  assert.equal(created.slug, "hn-top-stories");
  assert.equal((extract as ExtractFn & { calls: number }).calls, 1);

  const first = await serveEndpoint("hn-top-stories", { db, extract });
  assert.equal(first.status, 200);
  assert.equal(first.from_cache, true);
  assert.equal(first.envelope.ok, true);
  assert.equal(first.envelope.source_url, "https://news.ycombinator.com/");
  assert.equal(first.envelope.cache_ttl_s, 60);
  assert.equal((first.envelope.data as { stories: unknown[] }).stories[0].title, "Java 27 Released");
  assert.equal((extract as ExtractFn & { calls: number }).calls, 1);

  const second = await serveEndpoint("hn-top-stories", { db, extract });
  assert.equal(second.from_cache, true);
  assert.equal((extract as ExtractFn & { calls: number }).calls, 1);
  assert.equal(second.envelope.fetched_at, first.envelope.fetched_at);

  const schema = await sourceSchema("hn-top-stories", db);
  assert.equal(schema.schema.properties?.stories?.type, "array");
});

test("listSources includes the created slug and duration", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "siteapi-")), "list.db");
  const db = openDb(file);
  const extract = fakeExtract(payload());
  await createSource(
    {
      url: "https://news.ycombinator.com",
      prompt: "top stories with rank, title, points, comment count, url",
      slug: "hn-top-stories",
    },
    { db, extract },
  );
  const listed = listSources(db);
  assert.equal(listed[0].slug, "hn-top-stories");
  assert.equal(listed[0].published, true);
  assert.equal(listed[0].last_duration_ms, 3);
});

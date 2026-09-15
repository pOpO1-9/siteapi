import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "./db";
import { HN_SCHEMA } from "./fixtures/hn";
import { openApiDocument } from "./openapi";
import { createSource, sourceOpenApi, type ExtractFn } from "./sources";
import type { ExtractResult } from "./extract";

test("openApiDocument wraps the stored schema in the envelope data field", () => {
  const doc = openApiDocument({
    slug: "hn-top-stories",
    source_url: "https://news.ycombinator.com/",
    prompt: "top stories with rank, title, points, comment count, url",
    schema: HN_SCHEMA,
    cache_ttl_s: 60,
    origin: "http://localhost:3000",
  });

  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.info.title, "SiteAPI — hn-top-stories");
  assert.equal(doc.servers[0].url, "http://localhost:3000");
  assert.ok(doc.paths["/v1/e/hn-top-stories"]?.get);
  assert.ok(doc.paths["/v1/e/hn-top-stories.schema"]?.get);
  assert.ok(doc.paths["/v1/e/hn-top-stories/openapi.json"]?.get);
  assert.equal(doc.paths["/v1/e/hn-top-stories"].get.parameters[0].name, "fresh");
  assert.equal(doc.components.securitySchemes.siteapiKey.scheme, "bearer");
  assert.deepEqual(doc.components.schemas.ExtractedData, HN_SCHEMA);
  assert.equal(doc.components.schemas.Envelope.properties.data.$ref, "#/components/schemas/ExtractedData");
  assert.equal(
    doc.paths["/v1/e/hn-top-stories"].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/Envelope",
  );
  assert.ok(doc.paths["/v1/e/hn-top-stories"].get.responses["429"]);
});

test("sourceOpenApi reads the persisted schema for a published slug", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "siteapi-oa-")), "test.db");
  const db = openDb(file);
  const extract: ExtractFn = async () =>
    ({
      ok: true,
      source_url: "https://news.ycombinator.com/",
      final_url: "https://news.ycombinator.com/",
      prompt: "top stories",
      schema: HN_SCHEMA,
      instructions: "",
      data: { stories: [] },
      warnings: [],
      retried: false,
      fetched_at: new Date().toISOString(),
      prompt_version: "v1",
      extractor_version: "extract-0.1.0",
      capture_ms: 1,
      extract_ms: 1,
      markdown_hash: "h",
      reused: false,
    }) satisfies ExtractResult;

  await createSource(
    { url: "https://news.ycombinator.com", prompt: "top stories", slug: "hn-top-stories" },
    { db, extract },
  );

  const doc = await sourceOpenApi("hn-top-stories", "http://localhost:3000", db);
  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(doc.components.schemas.ExtractedData, HN_SCHEMA);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { SiteApiError } from "./errors";
import { extractToSchema, inferSchemaFromText } from "./extract";
import { HN_MARKDOWN, HN_SCHEMA, HN_VALID_PAYLOAD } from "./fixtures/hn";
import type { ChatFn } from "./llm";

test("extractToSchema accepts a valid first LLM pass", async () => {
  const chat: ChatFn = async () => JSON.stringify(HN_VALID_PAYLOAD);
  const result = await extractToSchema(
    {
      schema: HN_SCHEMA,
      instructions: "HN stories",
      markdown: HN_MARKDOWN,
      accessibility: "",
    },
    chat,
  );
  assert.equal(result.retried, false);
  assert.equal((result.data as typeof HN_VALID_PAYLOAD).stories[0].rank, 1);
});

test("extractToSchema retries once after Zod failure", async () => {
  let calls = 0;
  const chat: ChatFn = async () => {
    calls += 1;
    if (calls === 1) {
      return JSON.stringify({ stories: [{ rank: 1, points: 10 }] });
    }
    return JSON.stringify(HN_VALID_PAYLOAD);
  };
  const result = await extractToSchema(
    {
      schema: HN_SCHEMA,
      instructions: "HN stories",
      markdown: HN_MARKDOWN,
      accessibility: "",
    },
    chat,
  );
  assert.equal(calls, 2);
  assert.equal(result.retried, true);
  assert.equal((result.data as typeof HN_VALID_PAYLOAD).stories.length, 3);
});

test("extractToSchema throws schema_mismatch after a failed retry", async () => {
  await assert.rejects(
    () =>
      extractToSchema(
        {
          schema: HN_SCHEMA,
          instructions: "",
          markdown: HN_MARKDOWN,
          accessibility: "",
        },
        async () => JSON.stringify({ nope: true }),
      ),
    (err: unknown) => err instanceof SiteApiError && err.code === "schema_mismatch",
  );
});

test("inferSchemaFromText compiles the model schema to Zod", async () => {
  const chat: ChatFn = async () =>
    JSON.stringify({
      schema: HN_SCHEMA,
      instructions: "treat discuss as 0 comments",
    });
  const inferred = await inferSchemaFromText(
    {
      prompt: "top stories with rank, title, points, comment count, url",
      title: "Hacker News",
      markdown: HN_MARKDOWN,
    },
    chat,
  );
  assert.equal(inferred.instructions.includes("discuss"), true);
  assert.equal(inferred.schema.properties?.stories?.type, "array");
});

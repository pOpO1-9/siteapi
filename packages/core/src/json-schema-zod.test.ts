import assert from "node:assert/strict";
import { test } from "node:test";
import { HN_SCHEMA, HN_VALID_PAYLOAD } from "./fixtures/hn";
import { parseJsonFromLlm } from "./json-schema";
import { zodFromJsonSchema } from "./json-schema-zod";

test("HN schema compiles and accepts a valid stories payload", () => {
  const zod = zodFromJsonSchema(HN_SCHEMA);
  const parsed = zod.parse(HN_VALID_PAYLOAD);
  assert.equal(parsed.stories.length, 3);
  assert.equal(parsed.stories[0].rank, 1);
  assert.equal(parsed.stories[0].title, "Show HN: An e-ink frame that hears birds");
  assert.equal(parsed.stories[2].comments, 0);
});

test("HN schema coerces numeric strings", () => {
  const zod = zodFromJsonSchema(HN_SCHEMA);
  const parsed = zod.parse({
    stories: [
      {
        rank: "1",
        title: "Java 27 Released",
        points: "183",
        comments: "132",
        url: "https://openjdk.org/",
      },
    ],
  });
  assert.equal(parsed.stories[0].rank, 1);
  assert.equal(parsed.stories[0].points, 183);
});

test("HN schema rejects a story missing title", () => {
  const zod = zodFromJsonSchema(HN_SCHEMA);
  const result = zod.safeParse({
    stories: [
      {
        rank: 1,
        points: 10,
        comments: 2,
        url: "https://example.com",
      },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.message, /title/i);
  }
});

test("HN schema rejects a non-integer rank", () => {
  const zod = zodFromJsonSchema(HN_SCHEMA);
  const result = zod.safeParse({
    stories: [
      {
        rank: 1.5,
        title: "Nope",
        points: 1,
        comments: 0,
        url: "https://example.com",
      },
    ],
  });
  assert.equal(result.success, false);
});

test("parseJsonFromLlm reads fenced JSON", () => {
  const parsed = parseJsonFromLlm("```json\n{\"ok\":true}\n```");
  assert.deepEqual(parsed, { ok: true });
});

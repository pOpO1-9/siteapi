import {
  EXTRACT_SYSTEM,
  INFER_SYSTEM,
  PROMPT_VERSION,
  extractRetryMessage,
  extractUserMessage,
  inferUserMessage,
} from "../prompts/v1";
import {
  DEFAULT_EXTRACT_PROMPT,
  EXTRACT_PIPELINE_VERSION,
  LLM_MISSING_MESSAGE,
  MAX_EXTRACT_A11Y_CHARS,
  MAX_EXTRACT_MARKDOWN_CHARS,
  MAX_INFER_MARKDOWN_CHARS,
} from "./constants";
import { createHash } from "node:crypto";
import { SiteApiError } from "./errors";
import { type ChatFn, chatComplete, llmConfig } from "./llm";
import { type JsonSchema, asJsonSchema, clip, parseJsonFromLlm } from "./json-schema";
import { formatZodIssues, zodFromJsonSchema } from "./json-schema-zod";
import { capturePage } from "./capture";

export type { JsonSchema };

export { PROMPT_VERSION };

export type ExtractResult = {
  ok: true;
  source_url: string;
  final_url: string;
  prompt: string;
  schema: JsonSchema;
  instructions: string;
  data: unknown;
  warnings: string[];
  retried: boolean;
  fetched_at: string;
  prompt_version: string;
  extractor_version: string;
  capture_ms: number;
  extract_ms: number;
  markdown_hash: string;
  reused: boolean;
};

export function hashMarkdown(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

function pickInferredSchema(parsed: unknown): { schema: JsonSchema; instructions: string } {
  const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  if (obj && "schema" in obj) {
    return {
      schema: asJsonSchema(obj.schema),
      instructions: typeof obj.instructions === "string" ? obj.instructions : "",
    };
  }
  return { schema: asJsonSchema(parsed), instructions: "" };
}

function pickExtractedData(parsed: unknown, schema: JsonSchema): unknown {
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "data" in parsed &&
    !(schema.properties && "data" in schema.properties)
  ) {
    return (parsed as { data: unknown }).data;
  }
  return parsed;
}

export async function inferSchemaFromText(
  input: { prompt: string; title: string; markdown: string },
  chat: ChatFn = chatComplete,
): Promise<{ schema: JsonSchema; instructions: string }> {
  const content = await chat([
    { role: "system", content: INFER_SYSTEM },
    {
      role: "user",
      content: inferUserMessage({
        prompt: input.prompt,
        title: input.title,
        markdown: clip(input.markdown, MAX_INFER_MARKDOWN_CHARS),
      }),
    },
  ]);
  const picked = pickInferredSchema(parseJsonFromLlm(content));
  if (picked.schema.type && picked.schema.type !== "object" && !picked.schema.properties) {
    throw new SiteApiError("schema_mismatch", "Inferred schema root must be an object.");
  }
  zodFromJsonSchema(picked.schema);
  return picked;
}

export async function extractToSchema(
  input: {
    schema: JsonSchema;
    instructions: string;
    markdown: string;
    accessibility: string;
  },
  chat: ChatFn = chatComplete,
): Promise<{ data: unknown; retried: boolean }> {
  const zod = zodFromJsonSchema(input.schema);
  const schemaJson = JSON.stringify(input.schema, null, 2);
  const user = extractUserMessage({
    schemaJson,
    instructions: input.instructions,
    markdown: clip(input.markdown, MAX_EXTRACT_MARKDOWN_CHARS),
    accessibility: clip(input.accessibility, MAX_EXTRACT_A11Y_CHARS),
  });

  const messages: Parameters<ChatFn>[0] = [
    { role: "system", content: EXTRACT_SYSTEM },
    { role: "user", content: user },
  ];

  const first = await chat(messages);
  const firstData = pickExtractedData(parseJsonFromLlm(first), input.schema);
  const firstParse = zod.safeParse(firstData);
  if (firstParse.success) {
    return { data: firstParse.data, retried: false };
  }

  messages.push({ role: "assistant", content: first });
  messages.push({
    role: "user",
    content: extractRetryMessage(formatZodIssues(firstParse.error), first.slice(0, 4_000)),
  });

  const second = await chat(messages);
  const secondData = pickExtractedData(parseJsonFromLlm(second), input.schema);
  const secondParse = zod.safeParse(secondData);
  if (secondParse.success) {
    return { data: secondParse.data, retried: true };
  }

  throw new SiteApiError("schema_mismatch", "Extracted JSON did not match the schema after one retry.", {
    issues: formatZodIssues(secondParse.error),
  });
}

export async function extractPage(opts: {
  url: string;
  prompt?: string;
  schema?: JsonSchema;
  instructions?: string;
  ignoreRobots?: boolean;
  chat?: ChatFn;
  reuseIfHash?: string;
  reuseData?: unknown;
}): Promise<ExtractResult> {
  const prompt = (opts.prompt ?? DEFAULT_EXTRACT_PROMPT).trim() || DEFAULT_EXTRACT_PROMPT;
  const chat = opts.chat ?? chatComplete;
  const started = Date.now();
  const capture = await capturePage(opts.url, { ignoreRobots: opts.ignoreRobots });
  const capture_ms = Date.now() - started;
  const markdown_hash = hashMarkdown(capture.markdown);

  if (opts.reuseIfHash && opts.reuseIfHash === markdown_hash && opts.reuseData !== undefined) {
    return {
      ok: true,
      source_url: capture.url,
      final_url: capture.final_url,
      prompt,
      schema: opts.schema ?? { type: "object" },
      instructions: opts.instructions ?? "",
      data: opts.reuseData,
      warnings: [...capture.warnings, "reused extract; page hash unchanged"],
      retried: false,
      fetched_at: capture.fetched_at,
      prompt_version: PROMPT_VERSION,
      extractor_version: EXTRACT_PIPELINE_VERSION,
      capture_ms,
      extract_ms: 0,
      markdown_hash,
      reused: true,
    };
  }

  if (!opts.chat && !llmConfig().apiKey) {
    throw new SiteApiError("missing_api_key", LLM_MISSING_MESSAGE);
  }

  const extractStarted = Date.now();
  const inferred = opts.schema
    ? { schema: opts.schema, instructions: opts.instructions ?? "" }
    : await inferSchemaFromText(
        { prompt, title: capture.title, markdown: capture.markdown },
        chat,
      );

  const extracted = await extractToSchema(
    {
      schema: inferred.schema,
      instructions: inferred.instructions,
      markdown: capture.markdown,
      accessibility: capture.accessibility,
    },
    chat,
  );

  return {
    ok: true,
    source_url: capture.url,
    final_url: capture.final_url,
    prompt,
    schema: inferred.schema,
    instructions: inferred.instructions,
    data: extracted.data,
    warnings: capture.warnings,
    retried: extracted.retried,
    fetched_at: capture.fetched_at,
    prompt_version: PROMPT_VERSION,
    extractor_version: EXTRACT_PIPELINE_VERSION,
    capture_ms,
    extract_ms: Date.now() - extractStarted,
    markdown_hash,
    reused: false,
  };
}

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  slug: text("slug").primaryKey(),
  url: text("url").notNull(),
  prompt: text("prompt").notNull(),
  schemaJson: text("schema_json").notNull(),
  instructions: text("instructions").notNull().default(""),
  cacheTtlS: integer("cache_ttl_s").notNull(),
  samplePayloadJson: text("sample_payload_json"),
  cachedPayloadJson: text("cached_payload_json"),
  cachedFetchedAt: text("cached_fetched_at"),
  cacheMarkdownHash: text("cache_markdown_hash"),
  createdAt: text("created_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  promptVersion: text("prompt_version"),
  extractorVersion: text("extractor_version"),
  warningsJson: text("warnings_json"),
  lastDurationMs: integer("last_duration_ms"),
  published: integer("published").notNull().default(1),
});

export type SourceRow = typeof sources.$inferSelect;

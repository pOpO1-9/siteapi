import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { dbFilePath } from "./constants";
import * as schema from "./db-schema";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  cache_ttl_s INTEGER NOT NULL,
  sample_payload_json TEXT,
  cached_payload_json TEXT,
  cached_fetched_at TEXT,
  cache_markdown_hash TEXT,
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT,
  prompt_version TEXT,
  extractor_version TEXT,
  warnings_json TEXT,
  last_duration_ms INTEGER,
  published INTEGER NOT NULL DEFAULT 1
);
`;

function migrate(sqlite: SqliteDatabase) {
  const cols = sqlite.prepare("PRAGMA table_info(sources)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("last_duration_ms")) {
    sqlite.exec("ALTER TABLE sources ADD COLUMN last_duration_ms INTEGER");
  }
  if (!names.has("published")) {
    sqlite.exec("ALTER TABLE sources ADD COLUMN published INTEGER NOT NULL DEFAULT 1");
  }
}

export type SiteApiDb = ReturnType<typeof drizzle<typeof schema>>;

let singleton: SiteApiDb | null = null;

export function openDb(file = dbFilePath()): SiteApiDb {
  const abs = resolve(file);
  mkdirSync(dirname(abs), { recursive: true });
  const sqlite = new Database(abs);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(CREATE_SQL);
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

export function getDb(): SiteApiDb {
  if (!singleton) singleton = openDb();
  return singleton;
}

export function resetDbSingleton(): void {
  singleton = null;
}

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function applyEnvFile(path: string) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

applyEnvFile(resolve(repoRoot, ".env"));
applyEnvFile(resolve(process.cwd(), ".env"));

const raw = process.env.SITEAPI_DB_PATH?.trim();
if (!raw || !isAbsolute(raw)) {
  const relative = raw || "data/siteapi.db";
  const webDb = resolve(repoRoot, "apps/web", relative);
  const rootDb = resolve(repoRoot, relative);
  process.env.SITEAPI_DB_PATH = existsSync(webDb) ? webDb : existsSync(rootDb) ? rootDb : webDb;
}

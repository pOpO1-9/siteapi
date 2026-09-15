import "./load-env";
import { DEFAULT_EXTRACT_PROMPT, ignoreRobotsFromEnv } from "./constants";
import { asSiteApiError } from "./errors";
import { extractPage } from "./extract";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}

function opt(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function positionalUrl(): string | undefined {
  const skip = new Set(["--prompt", "--ignore-robots"]);
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--prompt") {
      i += 1;
      continue;
    }
    if (skip.has(a) || a.startsWith("--")) continue;
    return a;
  }
  return undefined;
}

const url = positionalUrl();
if (!url) {
  console.error(
    `Usage: npm run extract -- <url> [--prompt "${DEFAULT_EXTRACT_PROMPT}"] [--ignore-robots]`,
  );
  process.exit(2);
}

try {
  const result = await extractPage({
    url,
    prompt: opt("--prompt"),
    ignoreRobots: arg("--ignore-robots") || ignoreRobotsFromEnv(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
} catch (err) {
  const mapped = asSiteApiError(err);
  console.error(JSON.stringify(mapped.toJSON(), null, 2));
  process.exit(1);
}

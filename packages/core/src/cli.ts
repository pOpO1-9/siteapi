import "./load-env";
import { ignoreRobotsFromEnv } from "./constants";
import { asSiteApiError } from "./errors";
import { capturePage } from "./capture";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}

function positionalUrl(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith("--"));
}

const url = positionalUrl();
if (!url) {
  console.error("Usage: npm run capture -- <url> [--json] [--ignore-robots]");
  process.exit(2);
}

try {
  const result = await capturePage(url, {
    ignoreRobots: arg("--ignore-robots") || ignoreRobotsFromEnv(),
  });
  if (arg("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`# ${result.title}\n\n`);
    process.stdout.write(`source: ${result.final_url}\n`);
    process.stdout.write(`status: ${result.status}  bytes: ${result.bytes}  ${result.duration_ms}ms\n\n`);
    process.stdout.write(`${result.markdown}\n`);
  }
  process.exit(0);
} catch (err) {
  const mapped = asSiteApiError(err);
  console.error(JSON.stringify(mapped.toJSON(), null, 2));
  process.exit(1);
}

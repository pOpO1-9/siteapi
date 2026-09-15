const base = process.env.SITEAPI_URL ?? "http://localhost:3000";
const url = `${base.replace(/\/$/, "")}/api/health`;

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.json();
  if (!res.ok || body.ok !== true) {
    console.error("unhealthy", res.status, body);
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`healthcheck failed: ${url}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

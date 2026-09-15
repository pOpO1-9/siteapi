# SiteAPI

Turn a public webpage into a live REST API.

Paste a URL, describe the data in English, get a stable endpoint: `GET /v1/e/{slug}`, OpenAPI, and MCP.

**MVP is complete.** Public pages only. BYO OpenAI-compatible LLM (Ollama-first).

## 60-second quickstart

```bash
git clone https://github.com/pOpO1-9/siteapi.git
cd siteapi
cp .env.example .env
npm install
npx playwright install chromium
npm run dev
```

Then in another terminal:

```bash
npm run health
npm run capture -- https://news.ycombinator.com
npm test
```

Set a BYO LLM in `.env`, then publish an endpoint:

```bash
# Ollama (or any OpenAI-compatible /v1)
# OPENAI_BASE_URL=http://127.0.0.1:11434/v1
# OPENAI_API_KEY=ollama
# OPENAI_MODEL=llama3.2

npm run extract -- https://news.ycombinator.com --prompt "top stories with rank, title, points, comment count, url"
```

`OPENAI_*` is **their** model. `SITEAPI_API_KEY` is **our** published-route key. Never mix them.

Health returns `{ "ok": true, "service": "siteapi", "mvp": "complete", ... }`. Capture prints HN as markdown. Extract returns `{ stories: [...] }` JSON.

Open [http://localhost:3000](http://localhost:3000).

### One-command (Docker)

```bash
cp .env.example .env
docker compose up --build
```

UI + API on `:3000`, worker stub attached. The image installs Playwright Chromium for capture.

## Environment

See `.env.example`:

| Variable | Purpose |
| --- | --- |
| `OPENAI_BASE_URL` | OpenAI-compatible `/v1` (Ollama: `http://127.0.0.1:11434/v1`) |
| `OPENAI_API_KEY` | Key for **their** LLM (`ollama` is fine locally) |
| `OPENAI_MODEL` | Model name on that server |
| `BROWSER_TIMEOUT_MS` | Playwright capture timeout |
| `CACHE_TTL_S` | Default endpoint cache (5–3600) |
| `SITEAPI_API_KEY` | Protects **our** `/v1/e/{slug}` and `POST /v1/sources` |
| `SITEAPI_RATE_LIMIT` | Max published `/v1` requests per key per window (`0` = unlimited) |
| `SITEAPI_RATE_WINDOW_S` | Rate-limit window in seconds (default `60`) |
| `HOST_GAP_MS` | Minimum gap between outbound fetches to the same host |
| `SITEAPI_DB_PATH` | SQLite file for persisted sources |
| `SITEAPI_IGNORE_ROBOTS` | Override robots.txt only for sites you own |

## curl example

Two keys: `SITEAPI_API_KEY` authenticates SiteAPI. `OPENAI_API_KEY` only talks to the LLM you pointed `OPENAI_BASE_URL` at.

Create (infers schema, extracts once, persists):

```bash
curl -s -X POST http://localhost:3000/v1/sources \
  -H "Authorization: Bearer $SITEAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://news.ycombinator.com\",\"prompt\":\"top stories with rank, title, points, comment count, url\",\"slug\":\"hn-top-stories\"}"
```

Read from SQLite cache:

```bash
curl -H "Authorization: Bearer $SITEAPI_API_KEY" \
  "http://localhost:3000/v1/e/hn-top-stories"
```

Schema:

```bash
curl -H "Authorization: Bearer $SITEAPI_API_KEY" \
  "http://localhost:3000/v1/e/hn-top-stories.schema"
```

OpenAPI (generated from that schema, envelope wrapped around `data`):

```bash
curl -H "Authorization: Bearer $SITEAPI_API_KEY" \
  "http://localhost:3000/v1/e/hn-top-stories/openapi.json"
```

Force a refresh:

```bash
curl -H "Authorization: Bearer $SITEAPI_API_KEY" \
  "http://localhost:3000/v1/e/hn-top-stories?fresh=true"
```

Healthcheck (no key):

```bash
curl http://localhost:3000/api/health
```

Capture a public page (debug, no key):

```bash
curl "http://localhost:3000/api/debug/capture?url=https://news.ycombinator.com&omit_html=1"
```

Extract HN into JSON (needs `OPENAI_API_KEY`):

```bash
curl --get "http://localhost:3000/api/debug/extract" \
  --data-urlencode "url=https://news.ycombinator.com" \
  --data-urlencode "prompt=top stories with rank, title, points, comment count, url"
```

Published `/v1` responses include `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. Over the cap: **429** `{ "ok": false, "error": { "code": "rate_limited" } }` plus `Retry-After`. Default is 60 requests / 60s per `SITEAPI_API_KEY`. The operator UI at `/` is not keyed and is not rate-limited this way. Outbound fetches to a given host still wait `HOST_GAP_MS`.

## Add a source in the UI

1. Open http://localhost:3000
2. Paste a public URL (start with `https://news.ycombinator.com`)
3. Describe the data: `top stories with rank, title, points, comment count, url`
4. Click **Create**
5. Copy the endpoint URL, curl snippet, or OpenAPI URL
6. Tune cache TTL if you need fresher data

One-click examples fill Hacker News, Next.js releases, and npm Playwright.

## MCP (Cursor / Claude)

`@siteapi/mcp` wraps the same routes over stdio: `list_sources`, `get_endpoint`, `get_schema`, `get_openapi`, `create_source`. It talks to the same SQLite file as the Next app. Needs `OPENAI_*` only for `create_source` / `fresh` refreshes.

```bash
npm run mcp
```

Copy the example file and set `cwd` to this repo:

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
```

`.cursor/mcp.json.example`:

```json
{
  "mcpServers": {
    "siteapi": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/siteapi"
    }
  }
}
```

Claude Desktop uses the same `command` / `args` / `cwd` shape under `mcpServers`.

## What this will not do

- Crawl the whole internet
- Bypass CAPTCHAs, logins, paywalls, or bot challenges
- Use stealth browsers, residential proxies, or cookie/password stores
- Stream the remote site over a websocket — “real-time” means a short cache + poll + optional change webhook
- Ignore `robots.txt` unless you explicitly override it for a site you own

If a page returns 403 or a challenge, SiteAPI fails clearly (`blocked`, `auth_protected`, `robots_disallowed`, `private_host`). Missing LLM config is `llm_failed` with an Ollama-first hint. Too many `/v1` calls is `rate_limited`.

## Roadmap

MVP shipped: capture → schema extract → persist/cache → UI → OpenAPI → MCP → per-key rate limits.

Later:

- Auth-site connectors
- Change webhooks
- Hosted cloud browsers
- Team API keys

## License

Apache-2.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SITEAPI_VERSION } from "@siteapi/core";
import {
  createSourceTool,
  getEndpointTool,
  getOpenApiTool,
  getSchemaTool,
  listSourcesTool,
} from "./tools";

export const MCP_TOOLS = [
  "list_sources",
  "get_endpoint",
  "get_schema",
  "get_openapi",
  "create_source",
] as const;

export function createSiteApiMcpServer() {
  const server = new McpServer({
    name: "siteapi",
    version: SITEAPI_VERSION,
  });

  server.registerTool(
    "list_sources",
    {
      title: "List sources",
      description: "List persisted SiteAPI sources (GET-style discovery). Returns slugs, URLs, cache TTL, and last success/error.",
    },
    async () => listSourcesTool(),
  );

  server.registerTool(
    "get_endpoint",
    {
      title: "Get endpoint",
      description:
        "GET /v1/e/{slug} — return the cached extract envelope { ok, fetched_at, cache_ttl_s, source_url, data, warnings }. Pass fresh=true to bypass cache.",
      inputSchema: {
        slug: z.string().describe("Published source slug, e.g. hn-top-stories"),
        fresh: z.boolean().optional().describe("Bypass cache (same as ?fresh=true)"),
      },
    },
    async ({ slug, fresh }) => getEndpointTool({ slug, fresh }),
  );

  server.registerTool(
    "get_schema",
    {
      title: "Get schema",
      description: "GET /v1/e/{slug}.schema — JSON Schema and extraction metadata for a published source.",
      inputSchema: {
        slug: z.string().describe("Published source slug"),
      },
    },
    async ({ slug }) => getSchemaTool({ slug }),
  );

  server.registerTool(
    "get_openapi",
    {
      title: "Get OpenAPI",
      description: "GET /v1/e/{slug}/openapi.json — OpenAPI 3.1 document wrapping the extract envelope.",
      inputSchema: {
        slug: z.string().describe("Published source slug"),
        origin: z.string().optional().describe("Server origin used in OpenAPI servers.url (default http://localhost:3000)"),
      },
    },
    async ({ slug, origin }) => getOpenApiTool({ slug, origin }),
  );

  server.registerTool(
    "create_source",
    {
      title: "Create source",
      description:
        "POST /v1/sources — capture a public URL, infer schema, extract once, persist, and publish GET /v1/e/{slug}. Needs OPENAI_* pointed at an OpenAI-compatible LLM (Ollama-first).",
      inputSchema: {
        url: z.string().describe("Public http(s) URL"),
        prompt: z.string().optional().describe("What data to extract, in English"),
        slug: z.string().optional().describe("Stable slug; inferred from the URL if omitted"),
        cache_ttl_s: z.number().int().optional().describe("Cache TTL in seconds (5–3600)"),
      },
    },
    async ({ url, prompt, slug, cache_ttl_s }) => createSourceTool({ url, prompt, slug, cache_ttl_s }),
  );

  return server;
}

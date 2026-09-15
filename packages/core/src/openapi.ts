import { SITEAPI_VERSION } from "./constants";
import type { JsonSchema } from "./json-schema";

export type OpenApiInput = {
  slug: string;
  source_url: string;
  prompt: string;
  schema: JsonSchema;
  cache_ttl_s: number;
  origin?: string;
};

function opId(prefix: string, slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "source";
  return `${prefix}_${safe}`;
}

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error"],
  properties: {
    ok: { type: "boolean", const: false },
    error: {
      type: "object",
      additionalProperties: true,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: { type: "object", additionalProperties: true },
      },
    },
  },
};

const envelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "fetched_at", "cache_ttl_s", "source_url", "data", "warnings"],
  properties: {
    ok: { type: "boolean", const: true },
    fetched_at: { type: "string", format: "date-time" },
    cache_ttl_s: { type: "integer", minimum: 5, maximum: 3600 },
    source_url: { type: "string", format: "uri" },
    data: { $ref: "#/components/schemas/ExtractedData" },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function jsonContent(ref: string) {
  return {
    content: {
      "application/json": {
        schema: { $ref: ref },
      },
    },
  };
}

const clientErrors = {
  "401": { description: "Missing or invalid SITEAPI_API_KEY", ...jsonContent("#/components/schemas/Error") },
  "404": { description: "Unknown or unpublished slug", ...jsonContent("#/components/schemas/Error") },
  "429": {
    description: "Rate limit exceeded for this SITEAPI_API_KEY",
    ...jsonContent("#/components/schemas/Error"),
  },
};

export function openApiDocument(input: OpenApiInput) {
  const origin = (input.origin ?? "http://localhost:3000").replace(/\/$/, "");
  const path = `/v1/e/${input.slug}`;
  const schemaPath = `${path}.schema`;
  const openapiPath = `${path}/openapi.json`;
  const extracted =
    input.schema && typeof input.schema === "object"
      ? (JSON.parse(JSON.stringify(input.schema)) as JsonSchema)
      : ({ type: "object" } satisfies JsonSchema);

  return {
    openapi: "3.1.0" as const,
    info: {
      title: `SiteAPI — ${input.slug}`,
      version: SITEAPI_VERSION,
      description: [
        `Live JSON from ${input.source_url}.`,
        `Prompt: ${input.prompt}.`,
        `Cache TTL: ${input.cache_ttl_s}s. Pass ?fresh=true to bypass cache.`,
        "Authenticate with SITEAPI_API_KEY (Authorization: Bearer). This is SiteAPI's key, not your LLM key.",
      ].join(" "),
    },
    servers: [{ url: origin }],
    tags: [{ name: "endpoint", description: "Published extract for this slug" }],
    security: [{ siteapiKey: [] }],
    paths: {
      [path]: {
        get: {
          operationId: opId("get", input.slug),
          summary: `Get ${input.slug}`,
          description: `Cached extract of ${input.source_url}.`,
          tags: ["endpoint"],
          parameters: [
            {
              name: "fresh",
              in: "query",
              required: false,
              schema: { type: "boolean" },
              description: "Bypass cache and re-extract.",
            },
          ],
          responses: {
            "200": { description: "Envelope with extracted data", ...jsonContent("#/components/schemas/Envelope") },
            "202": {
              description: "Refresh still running or failed; last-known data in the envelope",
              ...jsonContent("#/components/schemas/Envelope"),
            },
            ...clientErrors,
          },
        },
      },
      [schemaPath]: {
        get: {
          operationId: opId("get_schema", input.slug),
          summary: `JSON Schema for ${input.slug}`,
          tags: ["endpoint"],
          responses: {
            "200": { description: "Stored schema and source metadata", ...jsonContent("#/components/schemas/SourceSchema") },
            ...clientErrors,
          },
        },
      },
      [openapiPath]: {
        get: {
          operationId: opId("get_openapi", input.slug),
          summary: `OpenAPI document for ${input.slug}`,
          tags: ["endpoint"],
          responses: {
            "200": {
              description: "OpenAPI 3.1 document",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            ...clientErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        siteapiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description: "SITEAPI_API_KEY. This is SiteAPI's published-route key, not OPENAI_API_KEY.",
        },
      },
      schemas: {
        ExtractedData: extracted,
        Envelope: envelopeSchema,
        Error: errorSchema,
        SourceSchema: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "slug", "source_url", "prompt", "schema", "cache_ttl_s"],
          properties: {
            ok: { type: "boolean", const: true },
            slug: { type: "string" },
            source_url: { type: "string" },
            prompt: { type: "string" },
            schema: { $ref: "#/components/schemas/ExtractedData" },
            instructions: { type: "string" },
            cache_ttl_s: { type: "integer" },
            created_at: { type: "string" },
            last_success_at: { type: ["string", "null"] },
            last_error: { type: ["string", "null"] },
          },
        },
      },
    },
  };
}

export type OpenApiDocument = ReturnType<typeof openApiDocument>;

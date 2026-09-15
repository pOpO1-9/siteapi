import { asSiteApiError, DEFAULT_EXTRACT_PROMPT } from "@siteapi/core";
import {
  createSource,
  listSources,
  serveEndpoint,
  sourceOpenApi,
  sourceSchema,
} from "@siteapi/core/sources";

export type McpTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): McpTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(asSiteApiError(err).toJSON(), null, 2) }],
    isError: true,
  };
}

export async function listSourcesTool() {
  try {
    return ok({ sources: listSources() });
  } catch (err) {
    return fail(err);
  }
}

export async function getEndpointTool(input: { slug: string; fresh?: boolean }) {
  try {
    const served = await serveEndpoint(input.slug, { fresh: Boolean(input.fresh) });
    return ok({ status: served.status, from_cache: served.from_cache, ...served.envelope });
  } catch (err) {
    return fail(err);
  }
}

export async function getSchemaTool(input: { slug: string }) {
  try {
    return ok(await sourceSchema(input.slug));
  } catch (err) {
    return fail(err);
  }
}

export async function getOpenApiTool(input: { slug: string; origin?: string }) {
  try {
    return ok(await sourceOpenApi(input.slug, input.origin ?? "http://localhost:3000"));
  } catch (err) {
    return fail(err);
  }
}

export async function createSourceTool(input: {
  url: string;
  prompt?: string;
  slug?: string;
  cache_ttl_s?: number;
}) {
  try {
    const created = await createSource({
      url: input.url,
      prompt: (input.prompt ?? DEFAULT_EXTRACT_PROMPT).trim() || DEFAULT_EXTRACT_PROMPT,
      slug: input.slug,
      cache_ttl_s: input.cache_ttl_s,
    });
    return ok({
      slug: created.slug,
      endpoint: `/v1/e/${created.slug}`,
      schema_endpoint: `/v1/e/${created.slug}.schema`,
      openapi_endpoint: `/v1/e/${created.slug}/openapi.json`,
      schema: created.schema,
      instructions: created.instructions,
      ...created.envelope,
    });
  } catch (err) {
    return fail(err);
  }
}

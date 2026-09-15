import { asSiteApiError, DEFAULT_EXTRACT_PROMPT, httpStatusFor } from "@siteapi/core";
import { createSource, listSources } from "@siteapi/core/sources";
import type { JsonSchema } from "@siteapi/core/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try {
    return Response.json({ ok: true, sources: listSources() });
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      prompt?: string;
      slug?: string;
      cache_ttl_s?: number;
      schema?: JsonSchema;
    };
    if (!body.url?.trim()) {
      return Response.json(
        {
          ok: false,
          error: { code: "invalid_url", message: "URL and prompt are required.", details: {} },
        },
        { status: 400 },
      );
    }
    const created = await createSource({
      url: body.url.trim(),
      prompt: (body.prompt ?? DEFAULT_EXTRACT_PROMPT).trim() || DEFAULT_EXTRACT_PROMPT,
      slug: body.slug,
      cache_ttl_s: body.cache_ttl_s,
      schema: body.schema,
    });
    return Response.json({
      ok: true,
      slug: created.slug,
      schema: created.schema,
      instructions: created.instructions,
      ...created.envelope,
    });
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

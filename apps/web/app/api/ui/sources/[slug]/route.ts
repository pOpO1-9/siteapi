import { asSiteApiError, httpStatusFor } from "@siteapi/core";
import { getStudioSource, reextractSource, setCacheTtl, setPublished } from "@siteapi/core/sources";
import type { JsonSchema } from "@siteapi/core/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    return Response.json({ ok: true, ...getStudioSource(slug) });
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      published?: boolean;
      cache_ttl_s?: number;
      schema?: JsonSchema;
      reextract?: boolean;
    };
    if (typeof body.published === "boolean") {
      setPublished(slug, body.published);
    }
    if (typeof body.cache_ttl_s === "number" && !body.reextract && !body.schema) {
      setCacheTtl(slug, body.cache_ttl_s);
    }
    if (body.reextract || body.schema) {
      const studio = await reextractSource(slug, {
        schema: body.schema,
        cache_ttl_s: body.cache_ttl_s,
      });
      return Response.json({ ok: true, ...studio });
    }
    return Response.json({ ok: true, ...getStudioSource(slug) });
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

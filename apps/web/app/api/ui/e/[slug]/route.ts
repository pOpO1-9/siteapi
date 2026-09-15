import { asSiteApiError, httpStatusFor } from "@siteapi/core";
import { getStudioSource, reextractSource } from "@siteapi/core/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const fresh = new URL(req.url).searchParams.get("fresh") === "true";
    if (fresh) {
      const studio = await reextractSource(slug);
      return Response.json({ ok: true, ...studio, from_cache: false });
    }
    return Response.json({ ok: true, ...getStudioSource(slug) });
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

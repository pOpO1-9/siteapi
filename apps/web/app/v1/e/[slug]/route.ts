import { serveEndpoint, sourceSchema } from "@siteapi/core/sources";
import { protectPublished, v1Error, v1Json } from "../../../../lib/siteapi-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  let headers = new Headers();
  try {
    headers = protectPublished(req);
    const { slug: raw } = await ctx.params;
    const fresh = new URL(req.url).searchParams.get("fresh") === "true";
    const wantsSchema = raw.endsWith(".schema");
    const slug = wantsSchema ? raw.slice(0, -".schema".length) : raw;

    if (wantsSchema) {
      return v1Json(await sourceSchema(slug), 200, headers);
    }

    const served = await serveEndpoint(slug, { fresh });
    return v1Json(served.envelope, served.status, headers);
  } catch (err) {
    return v1Error(err, headers);
  }
}

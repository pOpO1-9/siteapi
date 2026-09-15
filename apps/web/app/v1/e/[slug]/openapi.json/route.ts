import { sourceOpenApi } from "@siteapi/core/sources";
import { protectPublished, v1Error, v1Json } from "../../../../../lib/siteapi-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  let headers = new Headers();
  try {
    headers = protectPublished(req);
    const { slug } = await ctx.params;
    const origin = new URL(req.url).origin;
    return v1Json(await sourceOpenApi(slug, origin), 200, headers);
  } catch (err) {
    return v1Error(err, headers);
  }
}

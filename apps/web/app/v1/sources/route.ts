import { DEFAULT_EXTRACT_PROMPT } from "@siteapi/core";
import { createSource } from "@siteapi/core/sources";
import { protectPublished, v1Error, v1Json } from "../../../lib/siteapi-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  let headers = new Headers();
  try {
    headers = protectPublished(req);
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      prompt?: string;
      slug?: string;
      cache_ttl_s?: number;
      schema?: import("@siteapi/core/extract").JsonSchema;
    };
    if (!body.url?.trim()) {
      return v1Json(
        {
          ok: false,
          error: {
            code: "invalid_url",
            message: "JSON body needs url and prompt.",
            details: {
              example: {
                url: "https://news.ycombinator.com",
                prompt: "top stories with rank, title, points, comment count, url",
                slug: "hn-top-stories",
              },
            },
          },
        },
        400,
        headers,
      );
    }

    const created = await createSource({
      url: body.url.trim(),
      prompt: (body.prompt ?? DEFAULT_EXTRACT_PROMPT).trim() || DEFAULT_EXTRACT_PROMPT,
      slug: body.slug,
      cache_ttl_s: body.cache_ttl_s,
      schema: body.schema,
    });

    return v1Json(
      {
        ok: true,
        slug: created.slug,
        endpoint: `/v1/e/${created.slug}`,
        schema_endpoint: `/v1/e/${created.slug}.schema`,
        openapi_endpoint: `/v1/e/${created.slug}/openapi.json`,
        schema: created.schema,
        instructions: created.instructions,
        ...created.envelope,
      },
      200,
      headers,
    );
  } catch (err) {
    return v1Error(err, headers);
  }
}

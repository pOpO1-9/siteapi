import { asSiteApiError, httpStatusFor, ignoreRobotsFromEnv } from "@siteapi/core";
import { capturePage } from "@siteapi/core/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "invalid_url",
          message: "Pass ?url=https://example.com",
          details: {
            example: "/api/debug/capture?url=https://news.ycombinator.com&omit_html=1",
          },
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await capturePage(url, {
      ignoreRobots: searchParams.get("ignore_robots") === "1" || ignoreRobotsFromEnv(),
    });

    if (searchParams.get("omit_html") === "1") {
      const { html, ...rest } = result;
      return Response.json({
        ...rest,
        html_omitted: true,
        html_chars: html.length,
      });
    }

    return Response.json(result);
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

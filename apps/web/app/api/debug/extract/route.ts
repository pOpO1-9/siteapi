import { asSiteApiError, DEFAULT_EXTRACT_PROMPT, httpStatusFor, ignoreRobotsFromEnv } from "@siteapi/core";
import { extractPage, type JsonSchema } from "@siteapi/core/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function runExtract(input: {
  url: string | null;
  prompt: string | null;
  ignoreRobots: boolean;
  schema?: JsonSchema;
}) {
  if (!input.url) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "invalid_url",
          message: "Pass a public url and a prompt.",
          details: {
            example:
              "/api/debug/extract?url=https://news.ycombinator.com&prompt=top%20stories%20with%20rank,%20title,%20points,%20comment%20count,%20url",
          },
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await extractPage({
      url: input.url,
      prompt: input.prompt || DEFAULT_EXTRACT_PROMPT,
      ignoreRobots: input.ignoreRobots,
      schema: input.schema,
    });
    return Response.json(result);
  } catch (err) {
    const mapped = asSiteApiError(err);
    return Response.json(mapped.toJSON(), { status: httpStatusFor(mapped.code) });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return runExtract({
    url: searchParams.get("url"),
    prompt: searchParams.get("prompt"),
    ignoreRobots: searchParams.get("ignore_robots") === "1" || ignoreRobotsFromEnv(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    prompt?: string;
    ignore_robots?: boolean;
    schema?: JsonSchema;
  };
  return runExtract({
    url: body.url ?? null,
    prompt: body.prompt ?? null,
    ignoreRobots: Boolean(body.ignore_robots) || ignoreRobotsFromEnv(),
    schema: body.schema,
  });
}

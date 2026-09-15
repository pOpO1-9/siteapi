import { cacheTtlSeconds } from "@siteapi/core";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    api_key: process.env.SITEAPI_API_KEY ?? "",
    cache_ttl_s: cacheTtlSeconds(),
    examples: [
      {
        id: "hn",
        label: "Hacker News",
        url: "https://news.ycombinator.com",
        prompt: "top stories with rank, title, points, comment count, url",
        slug: "hn-top-stories",
      },
      {
        id: "next-releases",
        label: "Next.js releases",
        url: "https://github.com/vercel/next.js/releases",
        prompt: "page title and release items with heading and body",
        slug: "nextjs-releases",
      },
      {
        id: "npm-playwright",
        label: "npm playwright",
        url: "https://www.npmjs.com/package/playwright",
        prompt: "package name, latest version, weekly downloads, license, description",
        slug: "npm-playwright",
      },
    ],
  });
}

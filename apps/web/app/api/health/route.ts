import { healthPayload } from "@siteapi/core";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ...healthPayload(),
    uptime_s: Math.round(process.uptime()),
  });
}

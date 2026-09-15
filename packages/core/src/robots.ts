import robotsParser from "robots-parser";
import { SITEAPI_USER_AGENT } from "./constants";
import { SiteApiError } from "./errors";
import { fetchExternal } from "./http";

export type RobotsDecision = {
  allowed: boolean;
  source: string;
  warning?: string;
};

export async function checkRobots(target: URL, ignoreRobots: boolean): Promise<RobotsDecision> {
  if (ignoreRobots) {
    return { allowed: true, source: target.origin + "/robots.txt", warning: "robots.txt skipped by override" };
  }

  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    const res = await fetchExternal(robotsUrl, { timeoutMs: 8_000 });
    if (res.status === 401) {
      throw new SiteApiError("auth_protected", "Auth-protected pages are not supported yet.", {
        url: robotsUrl,
        status: 401,
      });
    }
    if (res.status === 403) {
      throw new SiteApiError("blocked", "Site blocked the request (403 on robots.txt).", {
        url: robotsUrl,
        status: 403,
      });
    }
    if (res.status >= 400) {
      return {
        allowed: true,
        source: robotsUrl,
        warning: `robots.txt returned ${res.status}; treating as allow`,
      };
    }

    const robots = robotsParser(robotsUrl, res.body);
    const allowed = robots.isAllowed(target.href, SITEAPI_USER_AGENT) ?? true;
    return { allowed, source: robotsUrl };
  } catch (err) {
    if (err instanceof SiteApiError) throw err;
    return {
      allowed: true,
      source: robotsUrl,
      warning: "Could not read robots.txt; treating as allow",
    };
  }
}

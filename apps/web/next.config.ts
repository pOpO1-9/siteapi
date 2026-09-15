import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import type { NextConfig } from "next";

loadEnvConfig(resolve(process.cwd(), "../.."));
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  transpilePackages: ["@siteapi/core"],
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "turndown",
    "robots-parser",
    "zod",
    "better-sqlite3",
    "drizzle-orm",
  ],
};

export default nextConfig;

import { SITEAPI_VERSION } from "@siteapi/core";
import { MCP_TOOLS } from "./create-server";

export { createSiteApiMcpServer, MCP_TOOLS } from "./create-server";
export {
  createSourceTool,
  getEndpointTool,
  getOpenApiTool,
  getSchemaTool,
  listSourcesTool,
} from "./tools";

export function mcpStatus() {
  return {
    package: "@siteapi/mcp",
    version: SITEAPI_VERSION,
    ready: true,
    tools: [...MCP_TOOLS],
    note: "stdio MCP: npm run mcp — wraps GET /v1/e/{slug}, .schema, /openapi.json, POST /v1/sources",
  };
}

import "./load-env";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSiteApiMcpServer } from "./create-server";

const server = createSiteApiMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { resetDbSingleton } from "../../core/src/db";
import { createSiteApiMcpServer, MCP_TOOLS } from "./create-server";
import { mcpStatus } from "./index";
import { getSchemaTool } from "./tools";

test("mcpStatus is ready with the published tools", () => {
  const status = mcpStatus();
  assert.equal(status.ready, true);
  assert.deepEqual(status.tools, [...MCP_TOOLS]);
});

test("stdio server lists the REST wrappers over an in-memory transport", async () => {
  const mcp = createSiteApiMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "siteapi-test", version: "0.1.0" });
  await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((t) => t.name).sort(),
      [...MCP_TOOLS].sort(),
    );
  } finally {
    await client.close();
    await mcp.close();
  }
});

test("get_schema on a missing slug returns a SiteAPI error payload", async () => {
  process.env.SITEAPI_DB_PATH = join(mkdtempSync(join(tmpdir(), "siteapi-mcp-")), "t.db");
  resetDbSingleton();
  const result = await getSchemaTool({ slug: "does-not-exist" });
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text) as { ok: boolean; error?: { code?: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "not_found");
});

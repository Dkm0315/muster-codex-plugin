import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("MCP server exposes render and board tools with UI resources", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "muster-mcp-workspace-"));
  const codexHome = await mkdtemp(join(tmpdir(), "muster-mcp-codex-home-"));
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "demo.ts"), "export const value = 1;\n", "utf8");
  git(workspace, "init", "-q");
  git(workspace, "config", "user.email", "test@example.com");
  git(workspace, "config", "user.name", "Test");
  git(workspace, "add", ".");
  git(workspace, "commit", "-qm", "fixture");
  await writeFile(join(workspace, "src", "demo.ts"), "export const value = 2;\n", "utf8");

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(pluginRoot, "dist", "server.mjs")],
    cwd: pluginRoot,
    env: { ...process.env, CODEX_HOME: codexHome },
    stderr: "pipe",
  });
  const client = new Client({ name: "muster-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assert.ok(names.includes("muster_render_full_file"));
    assert.ok(names.includes("muster_render_activity"));
    assert.ok(names.includes("muster_prepare_board"));
    assert.ok(names.includes("muster_render_board"));
    assert.ok(names.includes("muster_transition_task"));

    const fileResult = await client.callTool({
      name: "muster_render_full_file",
      arguments: { cwd: workspace, path: "src/demo.ts" },
    });
    assert.equal(fileResult.structuredContent.kind, "file-history");
    assert.equal(fileResult.structuredContent.files.length, 1);
    assert.match(fileResult.structuredContent.files[0].working, /value = 2/);

    await client.callTool({
      name: "muster_prepare_board",
      arguments: { cwd: workspace, tasks: [{ id: "M-001", title: "Implement demo" }] },
    });
    const boardResult = await client.callTool({
      name: "muster_render_board",
      arguments: { cwd: workspace },
    });
    assert.equal(boardResult.structuredContent.kind, "board");
    assert.equal(boardResult.structuredContent.tasks.length, 1);

    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === "ui://muster/live-work-v1.html"));
    const ui = await client.readResource({ uri: "ui://muster/live-work-v1.html" });
    assert.match(ui.contents[0].text, /Full file/);
    assert.match(ui.contents[0].text, /Cards move from observed events/);
    assert.match(ui.contents[0].text, /Live execution/);
    assert.match(ui.contents[0].text, /muster_render_activity/);
    assert.match(ui.contents[0].text, /setInterval/);
    assert.match(ui.contents[0].text, /activity-live/);
    assert.match(ui.contents[0].text, /Proposed input, output and evidence/);
    assert.match(ui.contents[0].text, /Separate file block/);
  } finally {
    await client.close();
  }
});

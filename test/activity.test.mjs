import assert from "node:assert/strict";
import test from "node:test";
import { commandsFromToolCall, parseActivityJsonl, redactActivity } from "../companion/activity.mjs";

test("extracts real shell commands from Codex exec wrappers", () => {
  const commands = commandsFromToolCall({
    name: "exec",
    input: 'const r = await tools.exec_command({cmd:"git status --short",workdir:"/repo"}); text(r.output);',
  });
  assert.deepEqual(commands, ["git status --short"]);
});

test("redacts credentials before activity reaches the renderer", () => {
  const redacted = redactActivity("curl -u 'alice:secret' https://bob:hunter2@example.com Authorization=token-value");
  assert.doesNotMatch(redacted, /secret|hunter2|token-value/);
  assert.match(redacted, /•••/);
});

test("pairs calls with outputs and reports in-flight commands", () => {
  const records = [
    { timestamp: "2026-01-01T00:00:00Z", type: "response_item", payload: { type: "custom_tool_call", call_id: "one", name: "exec", input: 'tools.exec_command({cmd:"npm test"})' } },
    { timestamp: "2026-01-01T00:00:01Z", type: "response_item", payload: { type: "custom_tool_call_output", call_id: "one", output: [{ text: "3 passed" }] } },
    { timestamp: "2026-01-01T00:00:02Z", type: "response_item", payload: { type: "custom_tool_call", call_id: "two", name: "exec", input: 'tools.exec_command({cmd:"npm run build"})' } },
  ].map((record) => JSON.stringify(record)).join("\n");
  const activity = parseActivityJsonl(records);
  assert.equal(activity[0].status, "complete");
  assert.match(activity[0].output, /3 passed/);
  assert.equal(activity[1].status, "running");
});

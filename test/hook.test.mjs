import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hookPath = join(pluginRoot, "scripts", "observe_hook.py");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function runHook(codexHome, event) {
  const result = spawnSync("python3", [hookPath], {
    env: { ...process.env, CODEX_HOME: codexHome },
    input: JSON.stringify(event),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("hooks remain dormant without tags and activate only for the tagged session", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "muster-hook-home-"));
  const workspace = await mkdtemp(join(tmpdir(), "muster-hook-workspace-"));
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "demo.ts"), "export const value = 1;\n", "utf8");
  git(workspace, "init", "-q");
  git(workspace, "config", "user.email", "test@example.com");
  git(workspace, "config", "user.name", "Test");
  git(workspace, "add", ".");
  git(workspace, "commit", "-qm", "fixture");

  const quiet = runHook(codexHome, {
    session_id: "session-quiet",
    turn_id: "turn-1",
    cwd: workspace,
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain this repository.",
  });
  assert.equal(quiet, "");

  const activated = runHook(codexHome, {
    session_id: "session-live",
    turn_id: "turn-2",
    cwd: workspace,
    hook_event_name: "UserPromptSubmit",
    prompt: "$muster-live $muster-board Fix the demo.",
  });
  assert.match(activated, /muster_render_full_file/);
  assert.match(activated, /muster_prepare_board/);

  const persistent = runHook(codexHome, {
    session_id: "session-live",
    turn_id: "turn-3",
    cwd: workspace,
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue the same task.",
  });
  assert.match(persistent, /Muster Live is active for this task/);

  const before = runHook(codexHome, {
    session_id: "session-live",
    turn_id: "turn-3",
    tool_use_id: "tool-1",
    cwd: workspace,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo password=super-secret" },
  });
  assert.match(before, /recorded this action before execution/);

  await writeFile(join(workspace, "src", "demo.ts"), "export const value = 2;\n", "utf8");
  const observed = runHook(codexHome, {
    session_id: "session-live",
    turn_id: "turn-2",
    tool_use_id: "tool-1",
    cwd: workspace,
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "patch" },
    tool_response: { ok: true, output: "token=unsafe-value" },
  });
  assert.match(observed, /src\/demo\.ts/);
  const events = await readFile(join(codexHome, "state", "plugins", "muster-codex-plugin", "events", "session-live.jsonl"), "utf8");
  assert.match(events, /"changedFiles":\["src\/demo\.ts"\]/);
  assert.match(events, /"phase":"before"/);
  assert.match(events, /"status":"running"/);
  assert.doesNotMatch(events, /super-secret|unsafe-value/);
  assert.match(events, /\[REDACTED\]/);
});

test("plugin mention activates live observation without a dollar tag", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "muster-hook-plugin-"));
  const workspace = await mkdtemp(join(tmpdir(), "muster-hook-plugin-workspace-"));
  const output = runHook(codexHome, {
    session_id: "session-plugin",
    turn_id: "turn-plugin",
    cwd: workspace,
    hook_event_name: "UserPromptSubmit",
    prompt: "[@Muster Live Work](plugin://muster-codex-plugin@personal) show this work",
  });
  assert.match(output, /muster_render_activity/);
});

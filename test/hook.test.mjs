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

  await writeFile(join(workspace, "src", "demo.ts"), "export const value = 2;\n", "utf8");
  const observed = runHook(codexHome, {
    session_id: "session-live",
    turn_id: "turn-2",
    cwd: workspace,
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "patch" },
    tool_response: { ok: true },
  });
  assert.match(observed, /src\/demo\.ts/);
  const events = await readFile(join(codexHome, "state", "plugins", "muster-codex-plugin", "events", "session-live.jsonl"), "utf8");
  assert.match(events, /"changedFiles":\["src\/demo\.ts"\]/);
});

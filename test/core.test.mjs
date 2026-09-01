import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activateWorkspace,
  appendFileRender,
  createBoard,
  readActivityTimeline,
  readFullFileSnapshot,
  transitionBoard,
} from "../server/core.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function fixtureRepo() {
  const root = await mkdtemp(join(tmpdir(), "muster-codex-plugin-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "observer.ts"), "export const debounce = 50;\n", "utf8");
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture");
  return root;
}

test("reads complete before and working files with diff stats", async () => {
  const root = await fixtureRepo();
  await writeFile(join(root, "src", "observer.ts"), "export const debounce = 75;\nexport const visible = true;\n", "utf8");
  const snapshot = await readFullFileSnapshot(root, "src/observer.ts");
  assert.equal(snapshot.kind, "file");
  assert.match(snapshot.before, /debounce = 50/);
  assert.match(snapshot.working, /visible = true/);
  assert.equal(snapshot.stats.added, 2);
  assert.equal(snapshot.stats.deleted, 1);
  assert.ok(snapshot.tree.includes("src/observer.ts"));
  assert.equal(snapshot.truncated, false);
});

test("renders a new untracked text file as an added-file diff without staging", async () => {
  const root = await fixtureRepo();
  await writeFile(join(root, "src", "new-file.ts"), "export const visible = true;\n", "utf8");
  const snapshot = await readFullFileSnapshot(root, "src/new-file.ts");
  assert.equal(snapshot.before, "");
  assert.equal(snapshot.stats.added, 1);
  assert.equal(snapshot.stats.deleted, 0);
  assert.match(snapshot.patch, /--- \/dev\/null/);
  assert.match(snapshot.patch, /\+export const visible = true;/);
  assert.equal(git(root, "diff", "--cached", "--name-only").trim(), "");
});

test("keeps separately rendered files as separate blocks instead of replacing the prior file", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "muster-render-history-"));
  const root = await fixtureRepo();
  await writeFile(join(root, "src", "observer.ts"), "export const debounce = 90;\n", "utf8");
  await writeFile(join(root, "src", "second.ts"), "export const second = true;\n", "utf8");
  const previous = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = dataRoot;
  try {
    const first = await appendFileRender(root, "src/observer.ts");
    assert.equal(first.files.length, 1);
    const second = await appendFileRender(root, "src/second.ts");
    assert.equal(second.kind, "file-history");
    assert.deepEqual(second.files.map((file) => file.path), ["src/observer.ts", "src/second.ts"]);
    assert.equal(second.activePath, "src/second.ts");
  } finally {
    if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous;
  }
});

test("keeps twenty sequential file renders visible as twenty separate blocks", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "muster-render-twenty-"));
  const root = await fixtureRepo();
  const previous = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = dataRoot;
  try {
    let history;
    for (let index = 1; index <= 20; index += 1) {
      const path = `src/file-${String(index).padStart(2, "0")}.ts`;
      await writeFile(join(root, path), `export const value${index} = ${index};\n`, "utf8");
      history = await appendFileRender(root, path);
    }
    assert.equal(history.files.length, 20);
    assert.equal(history.files[0].path, "src/file-01.ts");
    assert.equal(history.files[19].path, "src/file-20.ts");
    assert.equal(history.files.every((file) => file.stats.added === 1 && file.stats.deleted === 0), true);
  } finally {
    if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous;
  }
});

test("refuses secret files and paths outside the workspace", async () => {
  const root = await fixtureRepo();
  await writeFile(join(root, ".env"), "SECRET=value\n", "utf8");
  await assert.rejects(() => readFullFileSnapshot(root, ".env"), /never rendered/);
  await assert.rejects(() => readFullFileSnapshot(root, "../outside.txt"), /outside/);
});

test("creates an empty board when no tasks are mentioned", () => {
  const board = createBoard({ cwd: "/tmp/example", tasks: [] });
  assert.equal(board.kind, "board");
  assert.deepEqual(board.tasks, []);
});

test("keeps dependent tasks in backlog and independent work ready", () => {
  const board = createBoard({
    cwd: "/tmp/example",
    tasks: [
      { id: "M-001", title: "Implement" },
      { id: "M-002", title: "Verify", dependencies: ["M-001"] },
    ],
  });
  assert.equal(board.tasks[0].status, "ready");
  assert.equal(board.tasks[1].status, "backlog");
});

test("requires one writer and worktree for running and evidence for review", () => {
  const board = createBoard({ cwd: "/tmp/example", tasks: [{ id: "M-001", title: "Implement" }] });
  assert.throws(() => transitionBoard(board, { taskId: "M-001", to: "running" }), /one writer/);
  transitionBoard(board, { taskId: "M-001", to: "running", writer: "codex-1", worktree: "worktrees/m-001" });
  assert.throws(() => transitionBoard(board, { taskId: "M-001", to: "review" }), /evidence/);
  transitionBoard(board, { taskId: "M-001", to: "review", evidence: { kind: "test", summary: "targeted suite passed" } });
  transitionBoard(board, { taskId: "M-001", to: "done", evidence: { kind: "human-review", summary: "review accepted" } });
  assert.equal(board.tasks[0].status, "done");
  assert.equal(board.tasks[0].evidence.length, 2);
});

test("merges pre and post hook records into one live activity item", async () => {
  const root = await mkdtemp(join(tmpdir(), "muster-activity-data-"));
  const workspace = await mkdtemp(join(tmpdir(), "muster-activity-workspace-"));
  await mkdir(join(root, "events"), { recursive: true });
  await writeFile(join(root, "events", "session.jsonl"), [
    JSON.stringify({ at: "2026-09-01T10:00:00Z", event: "PreToolUse", activityId: "tool-1", phase: "before", status: "running", cwd: workspace, toolName: "Bash", toolInput: { command: "npm test" } }),
    JSON.stringify({ at: "2026-09-01T10:00:02Z", event: "PostToolUse", activityId: "tool-1", phase: "after", status: "completed", cwd: workspace, toolName: "Bash", toolInput: { command: "npm test" }, toolResponse: "12 passed", changedFiles: ["src/demo.ts"] }),
  ].join("\n") + "\n", "utf8");
  const previous = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = root;
  try {
    const activity = await readActivityTimeline(workspace);
    assert.equal(activity.kind, "activity");
    assert.equal(activity.items.length, 1);
    assert.equal(activity.items[0].status, "completed");
    assert.equal(activity.items[0].command, "npm test");
    assert.equal(activity.items[0].output, "12 passed");
    assert.equal(activity.items[0].durationMs, 2000);
  } finally {
    if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous;
  }
});

test("activates a workspace in plugin state for post-restart hook observation", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "muster-workspace-active-"));
  const workspace = await mkdtemp(join(tmpdir(), "muster-workspace-active-repo-"));
  const previous = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = dataRoot;
  try {
    assert.equal(await activateWorkspace(workspace), workspace);
    const files = await import("node:fs/promises").then(({ readdir }) => readdir(join(dataRoot, "workspaces")));
    assert.equal(files.length, 1);
  } finally {
    if (previous === undefined) delete process.env.PLUGIN_DATA; else process.env.PLUGIN_DATA = previous;
  }
});

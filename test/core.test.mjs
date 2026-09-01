import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createBoard,
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

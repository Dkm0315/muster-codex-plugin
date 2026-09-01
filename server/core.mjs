import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 400_000;
const SECRET_NAME = /^(?:\.env(?:\..*)?|credentials?|secrets?|id_[a-z0-9_-]+|.*\.(?:pem|key|p12|pfx))$/i;

export const LANES = ["backlog", "ready", "running", "review", "done"];

export function pluginDataRoot() {
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : resolve(homedir(), ".codex");
  return resolve(codexHome, "state", "plugins", "muster-codex-plugin");
}

export function boardKey(cwd) {
  return createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 20);
}

async function git(cwd, args, options = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: options.encoding ?? "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 5000,
    });
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    return { ok: false, stdout: "", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function resolveWorkspaceFile(cwdInput, pathInput) {
  const cwd = resolve(cwdInput);
  const candidate = isAbsolute(pathInput) ? resolve(pathInput) : resolve(cwd, pathInput);
  const rel = relative(cwd, candidate);
  if (!rel || rel === ".") throw new Error("Choose a file inside the active workspace.");
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("The requested file is outside the active workspace.");
  if (SECRET_NAME.test(basename(candidate))) throw new Error("Credential and secret files are never rendered.");
  const info = await stat(candidate);
  if (!info.isFile()) throw new Error("The requested path is not a regular file.");
  if (info.size > MAX_FILE_BYTES) {
    throw new Error(`The file is ${info.size.toLocaleString()} bytes; the safe full-file limit is ${MAX_FILE_BYTES.toLocaleString()} bytes.`);
  }
  return { cwd, absolutePath: candidate, relativePath: rel.replaceAll("\\", "/"), size: info.size };
}

function parseNumstat(value) {
  const [addedRaw = "0", deletedRaw = "0"] = value.trim().split(/\s+/);
  const added = Number.parseInt(addedRaw, 10);
  const deleted = Number.parseInt(deletedRaw, 10);
  return {
    added: Number.isFinite(added) ? added : 0,
    deleted: Number.isFinite(deleted) ? deleted : 0,
  };
}

export async function readFullFileSnapshot(cwdInput, pathInput) {
  const target = await resolveWorkspaceFile(cwdInput, pathInput);
  const working = await readFile(target.absolutePath, "utf8");
  if (working.includes("\u0000")) throw new Error("Binary files are not rendered.");

  const [beforeResult, patchResult, statsResult, treeResult, untrackedResult] = await Promise.all([
    git(target.cwd, ["show", `HEAD:${target.relativePath}`]),
    git(target.cwd, ["diff", "HEAD", "--no-ext-diff", "--", target.relativePath]),
    git(target.cwd, ["diff", "HEAD", "--numstat", "--", target.relativePath]),
    git(target.cwd, ["ls-files"]),
    git(target.cwd, ["ls-files", "--others", "--exclude-standard"]),
  ]);

  const before = beforeResult.ok ? String(beforeResult.stdout) : "";
  const patch = patchResult.ok ? String(patchResult.stdout) : "";
  const stats = statsResult.ok && String(statsResult.stdout).trim()
    ? parseNumstat(String(statsResult.stdout))
    : { added: 0, deleted: 0 };
  const tree = [String(treeResult.stdout || ""), String(untrackedResult.stdout || "")]
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !SECRET_NAME.test(basename(path)))
    .slice(0, 1000)
    .sort();

  return {
    kind: "file",
    cwd: target.cwd,
    path: target.relativePath,
    size: target.size,
    lineCount: working.split("\n").length,
    working,
    before,
    patch,
    stats,
    tree,
    truncated: false,
  };
}

function normalizeTask(task, index) {
  const id = task.id?.trim() || `M-${String(index + 1).padStart(3, "0")}`;
  const dependencies = Array.isArray(task.dependencies)
    ? task.dependencies.map((value) => String(value).trim()).filter(Boolean)
    : [];
  return {
    id,
    title: String(task.title || "Untitled task").trim(),
    status: dependencies.length ? "backlog" : "ready",
    dependencies,
    model: String(task.model || "Unassigned").trim(),
    modelEvidence: String(task.modelEvidence || "").trim(),
    acceptance: String(task.acceptance || "").trim(),
    writer: null,
    worktree: null,
    threadLabel: String(task.threadLabel || "").trim(),
    evidence: [],
    attempts: [],
  };
}

export function createBoard({ cwd, tasks = [], name = "Muster work" }) {
  const normalized = tasks.map(normalizeTask);
  const ids = new Set(normalized.map((task) => task.id));
  for (const task of normalized) {
    task.dependencies = task.dependencies.filter((dependency) => ids.has(dependency) && dependency !== task.id);
    task.status = task.dependencies.length ? "backlog" : "ready";
  }
  return {
    kind: "board",
    boardId: boardKey(cwd),
    cwd: resolve(cwd),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: normalized,
    transitionPolicy: "observed-events-and-acceptance-evidence",
  };
}

export function transitionBoard(board, { taskId, to, evidence, writer, worktree, threadLabel }) {
  if (!LANES.includes(to)) throw new Error(`Unknown lane: ${to}`);
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const legal = {
    backlog: ["ready"],
    ready: ["running", "backlog"],
    running: ["review", "ready", "backlog"],
    review: ["done", "running"],
    done: [],
  };
  if (!legal[task.status].includes(to)) throw new Error(`Illegal transition: ${task.status} -> ${to}`);

  if (to === "ready") {
    const incomplete = task.dependencies.filter((dependency) => board.tasks.find((item) => item.id === dependency)?.status !== "done");
    if (incomplete.length) throw new Error(`Dependencies are incomplete: ${incomplete.join(", ")}`);
  }
  if (to === "running" && (!writer || !worktree)) {
    throw new Error("Running tasks require one writer and one worktree/attempt.");
  }
  if ((to === "review" || to === "done") && !evidence?.summary) {
    throw new Error(`${to} requires observed or acceptance evidence.`);
  }

  task.status = to;
  if (writer) task.writer = writer;
  if (worktree) task.worktree = worktree;
  if (threadLabel) task.threadLabel = threadLabel;
  if (evidence?.summary) {
    task.evidence.push({
      kind: String(evidence.kind || "observed"),
      summary: String(evidence.summary),
      at: new Date().toISOString(),
    });
  }
  if (to !== "running" && to !== "review") {
    task.writer = null;
    task.worktree = null;
  }
  board.updatedAt = new Date().toISOString();
  return board;
}

export async function saveBoard(board) {
  const directory = resolve(pluginDataRoot(), "boards");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${board.boardId}.json`);
  await writeFile(path, JSON.stringify(board, null, 2) + "\n", "utf8");
  return path;
}

export async function loadBoard(cwd) {
  const path = resolve(pluginDataRoot(), "boards", `${boardKey(cwd)}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return createBoard({ cwd, tasks: [], name: "Muster work" });
  }
}

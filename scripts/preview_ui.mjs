import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const widget = await readFile(fileURLToPath(new URL("../ui/workbench.html", import.meta.url)), "utf8");
const port = Number(process.env.PORT || 4174);

const board = {
  kind: "board",
  name: "Harden live inline diff under CI load",
  tasks: [
    { id: "M-104", title: "Document observer timing invariant", status: "backlog", dependencies: ["M-101"], model: "Luna", modelEvidence: "docs", acceptance: "Timing contract documented", evidence: [] },
    { id: "M-101", title: "Harden observer debounce", status: "ready", dependencies: [], model: "Sol", modelEvidence: "live probe", acceptance: "Targeted suite passes under load", evidence: [] },
    { id: "M-102", title: "Add rapid-burst regression test", status: "ready", dependencies: [], model: "Terra", modelEvidence: "integration test", acceptance: "Flake reproduces then passes", evidence: [] },
    { id: "M-100", title: "Capture live inline diff", status: "running", dependencies: [], model: "Sol", modelEvidence: "live probe", writer: "codex-1", worktree: "worktrees/m-100", threadLabel: "Harden live inline diff under CI load", evidence: [] },
    { id: "M-103", title: "Verify CI stability across 3 runs", status: "review", dependencies: [], model: "Terra", modelEvidence: "integration test", acceptance: "3/3 targeted runs green", evidence: [{ summary: "3/3 targeted runs green" }] },
    { id: "M-099", title: "Reproduce debounce flake", status: "done", dependencies: [], model: "Sol", modelEvidence: "live probe", evidence: [{ summary: "Flake reproduced consistently" }] },
  ],
};

const before = Array.from({ length: 120 }, (_, index) => index === 74 ? "  private debounceMs = 50;" : `// unchanged observer context ${index + 1}`);
const working = [...before];
working[74] = "  private debounceMs = 75;";
const file = {
  kind: "file",
  cwd: "/repo/muster",
  path: "packages/core/src/workspace-observer.ts",
  lineCount: 120,
  before: before.join("\n"),
  working: working.join("\n"),
  patch: "@@ -75 +75 @@\n-  private debounceMs = 50;\n+  private debounceMs = 75;",
  stats: { added: 1, deleted: 1 },
  tree: ["packages/core/src/index.ts", "packages/core/src/workspace-observer.ts", "packages/core/src/event-bus.ts", "packages/core/test/observer-debounce.test.ts", "README.md"],
};

const host = (kind) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#050505;height:100%;}iframe{border:0;width:100%;height:100%;}</style><iframe id="widget" src="/widget"></iframe><script>const data=${JSON.stringify(kind === "file" ? file : board)};document.getElementById("widget").addEventListener("load",()=>document.getElementById("widget").contentWindow.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:{structuredContent:data}},"*"));</script>`;

createServer((request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  if (request.url === "/widget") response.end(widget);
  else response.end(host(new URL(request.url || "/", "http://localhost").searchParams.get("kind") || "board"));
}).listen(port, "127.0.0.1", () => console.log(`Muster UI preview: http://127.0.0.1:${port}/?kind=board`));

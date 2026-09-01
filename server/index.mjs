import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import {
  activateWorkspace,
  appendFileRender,
  createBoard,
  loadBoard,
  readActivityTimeline,
  saveBoard,
  transitionBoard,
} from "./core.mjs";

const UI_URI = "ui://muster/live-work-v1.html";
const uiPath = fileURLToPath(new URL("../ui/workbench.html", import.meta.url));
const uiHtml = await readFile(uiPath, "utf8");

const server = new McpServer(
  { name: "muster-live-work", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.registerResource("muster-live-work-ui", UI_URI, {}, async () => ({
  contents: [
    {
      uri: UI_URI,
      mimeType: "text/html;profile=mcp-app",
      text: uiHtml,
      _meta: { ui: { prefersBorder: false } },
    },
  ],
}));

const renderMeta = (invoking, invoked) => ({
  "openai/outputTemplate": UI_URI,
  "openai/toolInvocation/invoking": invoking,
  "openai/toolInvocation/invoked": invoked,
  ui: { resourceUri: UI_URI },
});

server.registerTool(
  "muster_render_activity",
  {
    title: "Render live execution activity",
    description: "Open the live pre/post execution timeline for the active workspace. Shows terminal commands, tools, skills, bounded output, timestamps and changed files while the tagged task runs.",
    inputSchema: { cwd: z.string().min(1).describe("Absolute active workspace root") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: renderMeta("Opening live execution…", "Live execution opened."),
  },
  async ({ cwd }) => {
    await activateWorkspace(cwd);
    const activity = await readActivityTimeline(cwd);
    return {
      structuredContent: activity,
      content: [{ type: "text", text: `Rendered ${activity.items.length} live execution event(s) for ${activity.cwd}.` }],
    };
  },
);

server.registerTool(
  "muster_render_full_file",
  {
    title: "Render the complete changed file",
    description: "Read a text file inside the active workspace and render the entire working file, its HEAD version, inline diff context, and repository tree. Call immediately after each edit while $muster-live is active.",
    inputSchema: {
      cwd: z.string().min(1).describe("Absolute active workspace root"),
      path: z.string().min(1).describe("Workspace-relative or absolute file path"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: renderMeta("Rendering the complete file…", "Complete file rendered."),
  },
  async ({ cwd, path }) => {
    try {
      const history = await appendFileRender(cwd, path);
      const snapshot = history.files.at(-1);
      return {
        structuredContent: history,
        content: [{ type: "text", text: `Rendered the complete ${snapshot.lineCount}-line file ${snapshot.path} with +${snapshot.stats.added} -${snapshot.stats.deleted}; ${history.files.length} file block(s) remain visible.` }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  },
);

const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  dependencies: z.array(z.string()).optional(),
  model: z.string().optional(),
  modelEvidence: z.string().optional(),
  acceptance: z.string().optional(),
  threadLabel: z.string().optional(),
});

server.registerTool(
  "muster_prepare_board",
  {
    title: "Prepare the Muster board",
    description: "Create or replace the workspace board from concrete tasks in the current prompt. Pass an empty task array when none were mentioned. This tool prepares data and does not start work.",
    inputSchema: {
      cwd: z.string().min(1),
      name: z.string().optional(),
      tasks: z.array(taskSchema),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      "openai/toolInvocation/invoking": "Preparing the board…",
      "openai/toolInvocation/invoked": "Board prepared.",
    },
  },
  async ({ cwd, name, tasks }) => {
    const board = createBoard({ cwd, name: name || "Muster work", tasks });
    await saveBoard(board);
    return {
      structuredContent: board,
      content: [{ type: "text", text: `Prepared ${board.tasks.length ? `${board.tasks.length} task(s)` : "an empty board"}. Call muster_render_board to display it.` }],
    };
  },
);

server.registerTool(
  "muster_render_board",
  {
    title: "Render the Muster board",
    description: "Render the current evidence-backed Kanban for the active workspace. Call after muster_prepare_board and whenever the user asks to see the board.",
    inputSchema: { cwd: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: renderMeta("Opening the board…", "Board opened."),
  },
  async ({ cwd }) => {
    const board = await loadBoard(cwd);
    return {
      structuredContent: board,
      content: [{ type: "text", text: `Rendered board ${board.name} with ${board.tasks.length} task(s).` }],
    };
  },
);

server.registerTool(
  "muster_transition_task",
  {
    title: "Transition a Muster task",
    description: "Move one task through a legal evidence-backed transition. Running requires one writer and worktree. Review and Done require evidence.",
    inputSchema: {
      cwd: z.string().min(1),
      taskId: z.string().min(1),
      to: z.enum(["backlog", "ready", "running", "review", "done"]),
      writer: z.string().optional(),
      worktree: z.string().optional(),
      threadLabel: z.string().optional(),
      evidence: z.object({ kind: z.string().optional(), summary: z.string().min(1) }).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: {
      "openai/toolInvocation/invoking": "Checking the transition…",
      "openai/toolInvocation/invoked": "Task updated.",
    },
  },
  async (input) => {
    try {
      const board = await loadBoard(input.cwd);
      transitionBoard(board, input);
      await saveBoard(board);
      return {
        structuredContent: board,
        content: [{ type: "text", text: `Moved ${input.taskId} to ${input.to}.` }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

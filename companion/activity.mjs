import { open } from "node:fs/promises";

const MAX_ROLLOUT_BYTES = 768 * 1024;
const MAX_OUTPUT_CHARS = 5000;

export function redactActivity(value) {
  return String(value || "")
    .replace(/(https?:\/\/[^\s:@/]+:)[^\s@/]+@/gi, "$1•••@")
    .replace(/(-u|--user)\s+(['"]?)[^\s'"]+:[^\s'"]+\2/gi, "$1 $2•••$2")
    .replace(/\b(authorization|api[_-]?key|access[_-]?token|secret|password|passwd)\s*[:=]\s*(['"]?)[^\s,'"}]+/gi, "$1=•••")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g, "•••");
}

function decodeQuoted(value) {
  try { return JSON.parse(`"${value}"`); } catch { return value; }
}

export function commandsFromToolCall(payload) {
  const input = String(payload?.input || "");
  if (payload?.name === "exec") {
    const commands = [...input.matchAll(/\bcmd\s*:\s*"((?:\\.|[^"\\])*)"/g)].map((match) => decodeQuoted(match[1]));
    if (commands.length) return commands;
    const patchPaths = [...input.matchAll(/\*\*\* (?:Add|Update|Delete) File:\s*([^\n\\"]+)/g)].map((match) => `apply_patch ${match[1].trim()}`);
    if (patchPaths.length) return patchPaths;
    const session = input.match(/session_id\s*:\s*(\d+)/)?.[1];
    if (session) return [`terminal session ${session}`];
  }
  return [payload?.name || payload?.type || "tool"];
}

function outputText(payload) {
  const output = payload?.output;
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) return "";
  return output.map((item) => item?.text || "").filter(Boolean).join("\n");
}

export function parseActivityJsonl(text, limit = 12) {
  const calls = new Map();
  const outputs = new Map();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    const payload = record?.payload;
    if (record.type !== "response_item" || !payload?.call_id) continue;
    if (payload.type === "custom_tool_call") calls.set(payload.call_id, { payload, at: record.timestamp });
    if (payload.type === "custom_tool_call_output") outputs.set(payload.call_id, outputText(payload));
  }
  return [...calls.entries()].flatMap(([callId, call]) => {
    const output = outputs.get(callId) || "";
    return commandsFromToolCall(call.payload).map((command, index) => ({
      id: `${callId}:${index}`,
      command: redactActivity(command),
      output: redactActivity(output).slice(-MAX_OUTPUT_CHARS),
      status: outputs.has(callId) ? "complete" : "running",
      at: call.at,
    }));
  }).slice(-limit);
}

export async function readThreadActivity(rolloutPath, limit = 12) {
  if (!rolloutPath) return [];
  let handle;
  try {
    handle = await open(rolloutPath, "r");
    const info = await handle.stat();
    const length = Math.min(info.size, MAX_ROLLOUT_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, info.size - length));
    const text = buffer.toString("utf8").replace(/^[^\n]*\n/, info.size > length ? "" : (match) => match);
    return parseActivityJsonl(text, limit);
  } catch {
    return [];
  } finally {
    await handle?.close().catch(() => {});
  }
}

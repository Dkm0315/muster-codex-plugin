---
name: muster-board
description: Generate and maintain an evidence-backed Kanban from tasks mentioned in the prompt, including an empty board when none are mentioned. Use only when explicitly invoked with $muster-board.
---

# Muster Board

Turn the user's requested work into an incremental, dependency-aware board without changing the native Codex task or thread model.

## Start the board

1. Extract only concrete tasks from the user's prompt. Do not invent filler work.
2. Call `muster_prepare_board` with the active workspace root and the extracted tasks. Pass an empty task array when the prompt names no tasks.
3. Record dependencies, acceptance evidence, and model rationale when the prompt or repository evidence supports them. Leave unknown values empty instead of guessing.
4. Call `muster_render_board` to show the current board.

## Execution behavior

- Lanes are Backlog, Ready, Running, Review, and Done.
- A task is Ready only when its dependencies are Done. Independent Ready tasks may run in parallel only when the user's request authorizes executing the work.
- Bind each active task to one writer and one worktree/attempt. Independent tasks may have different writers and worktrees.
- Update state with `muster_transition_task`. Review and Done require concrete evidence; agent self-report is not evidence.
- Keep failed or superseded attempts in history. Do not erase them when retrying.
- Opening a card should lead back to its Codex thread when the host provides a supported thread link; otherwise show the stored thread label without fabricating a link.

## Boundaries

- Do not invoke this skill implicitly. It affects only turns where the user explicitly tags `$muster-board`.
- Generating a board does not authorize starting tasks, spawning subagents, merging code, or changing external state.
- Store board state in plugin data, never inside the user's repository or Codex rollout files.
- Use the standard MCP App UI. Never patch or replace the Codex app.

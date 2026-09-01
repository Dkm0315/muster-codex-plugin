# Product contract

## Live work

When `$muster-live` or the Muster Live Work plugin is explicitly tagged:

1. `muster_render_activity` opens before other tool work and polls the local event ledger while the task runs.
   The initial activity surface must be rendered before the first terminal, tool, or skill action so pending work is visible before execution begins.
2. Every terminal command, tool, and skill invocation is persisted in `PreToolUse` with `running` state before execution.
3. `PostToolUse` supplies bounded, redacted output, completion time, duration and changed-file evidence.
4. Native Codex narration, commands, stdout, stderr, exit status, and edit events remain visible in chronological order.
5. After a file mutation, the complete changed file is rendered automatically in the conversation through the standard MCP App result.
6. Unchanged code remains visible. Removed and added lines are decorated inline. Working, Before, and Split views are available.
7. Binary, secret, ignored credential, out-of-workspace, and oversized files fail closed.
8. Activation persists for the current task until `$muster-off`; unrelated tasks remain dormant.
9. The plugin does not add approvals or change the user's permission mode.

## Board

When `$muster-board` is explicitly tagged:

1. Concrete tasks are extracted from the prompt. No tasks produces an empty board.
2. Dependencies determine Backlog versus Ready.
3. Independent Ready tasks may be proposed for parallel execution, but the board alone does not authorize execution.
4. Running binds one task to one writer and one worktree/attempt.
5. Review and Done require evidence. Agent self-report is not evidence.
6. Board data stays in plugin state, never in the project repository or Codex rollout.

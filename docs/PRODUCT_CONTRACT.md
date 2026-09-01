# Product contract

## Live work

When `$muster-live` is explicitly tagged:

1. Native Codex narration, commands, stdout, stderr, exit status, and edit events remain visible in chronological order.
2. After a file mutation, the complete changed file is rendered automatically in the conversation through the standard MCP App result.
3. Unchanged code remains visible. Removed and added lines are decorated inline. Working, Before, and Split views are available.
4. Binary, secret, ignored credential, out-of-workspace, and oversized files fail closed.
5. The plugin does not add approvals or change the user's permission mode.

## Board

When `$muster-board` is explicitly tagged:

1. Concrete tasks are extracted from the prompt. No tasks produces an empty board.
2. Dependencies determine Backlog versus Ready.
3. Independent Ready tasks may be proposed for parallel execution, but the board alone does not authorize execution.
4. Running binds one task to one writer and one worktree/attempt.
5. Review and Done require evidence. Agent self-report is not evidence.
6. Board data stays in plugin state, never in the project repository or Codex rollout.

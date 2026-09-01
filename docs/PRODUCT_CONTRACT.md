# Product contract

## Live work

When `$muster-live` or the Muster Live Work plugin is explicitly tagged:

1. `muster_render_activity` keeps terminal, tool and skill history available for the activated task.
2. Every terminal command, tool, and skill invocation is persisted in `PreToolUse` with `running` state before execution.
3. `PostToolUse` supplies bounded, redacted output, completion time, duration and changed-file evidence.
   Git commands follow the same pre/post lifecycle as every other terminal action.
4. Native Codex narration, commands, stdout, stderr, exit status, and edit events remain visible in chronological order.
5. One `apply_patch` call may mutate exactly one file. A multi-file patch is denied before execution.
6. After each mutation, that file is rendered in a separate `muster_render_full_file` call before another edit begins. Renderer calls are never batched.
   Removed and added lines are decorated inline; Working, Before, and Split views remain available.
   Repeated renders accumulate by workspace: every previously rendered path remains visible as a separate file block when the next file is appended.
   Newly created untracked text files render as additions without staging or index mutation.
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

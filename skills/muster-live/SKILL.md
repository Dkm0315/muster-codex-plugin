---
name: muster-live
description: Keep Codex work inspectable with a live pre/post execution timeline and complete-file diffs. Use when explicitly invoked with $muster-live or the Muster Live Work plugin mention.
---

# Muster Live

Make the current Codex turn teachable and reviewable without changing its permissions or execution strategy.

## Required behavior

- Preserve native Codex narration, command executions, stdout, stderr, exit status, and inline change events in chronological order. Never replace them with only a summary.
- At the beginning of an activated task, call `muster_render_activity` with the active workspace root before any other terminal, tool, or skill work. Keep this MCP App surface open; it polls the plugin event ledger while work runs.
- Every terminal command, tool call, and skill invocation must be recorded by `PreToolUse` before execution and completed by `PostToolUse` with bounded redacted output. Never defer visibility until the end of the command.
- After any file mutation, call `muster_render_full_file` for every changed file. Pass the current workspace root and repository-relative path.
- Render the full file, not only a changed hunk. The tool returns the working file, the `HEAD` version when available, diff statistics, and a codebase tree for Working, Before, and Split inspection.
- When a shell command may have edited files, use the changed-file list supplied by the Muster hook context. If it is absent, inspect `git status --short` and render every affected text file.
- Keep working normally under the user's existing permission mode. This skill adds visibility; it must not request stricter permissions, add approval prompts, or prevent edits.
- Do not modify Codex configuration, thread metadata, project files, or app files to support the UI. All plugin state belongs outside the repository.

## Boundaries

- Activate only when the user tags `$muster-live` or the Muster Live Work plugin. Once activated, keep it enabled for the current task until the user writes `$muster-off`.
- Do not render binary files, secrets, ignored files, credential stores, `.env` files, or files outside the active workspace.
- If a file is too large for safe rendering, report its size and render a bounded index instead of truncating silently.
- The host controls final placement. Use the standard MCP App UI returned by the render tool; never patch the Codex app.

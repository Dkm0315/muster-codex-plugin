# Muster Live Work for Codex

Muster Live Work is an isolated Codex plugin for two explicit workflows:

- `$muster-live` keeps command execution visible and renders the **complete changed file** after edits, with Working, Before, and Split views.
- `$muster-board` creates an evidence-backed Kanban from tasks mentioned in the prompt, or an empty board when no tasks are mentioned.

The plugin does not patch the Codex app, rewrite Codex configuration, modify rollout files, migrate threads, or write state into repositories.

## Safety model

- Both skills are explicit-only. Ordinary Codex turns are unaffected.
- Hooks remain dormant unless the current prompt contains `$muster-live` or `$muster-board`.
- Hook state and boards live under `CODEX_HOME/state/plugins/muster-codex-plugin/`.
- Full-file rendering is restricted to regular text files inside the active workspace.
- `.env`, credential, key, certificate, and out-of-workspace files are rejected.
- Full access changes Codex authorization only; Muster never uses it to hide activity.
- The plugin does not merge, spawn parallel work, or transition tasks merely because a board exists.

## What installs

```text
.codex-plugin/plugin.json       Standard Codex plugin manifest
skills/muster-live/             Explicit full-file visibility workflow
skills/muster-board/            Explicit evidence-backed Kanban workflow
hooks/hooks.json                Turn-scoped observation hooks
scripts/observe_hook.py         Non-blocking event recorder
server/                         Local stdio MCP server
dist/server.mjs                 Bundled dependency-free runtime entry
ui/workbench.html               MCP App UI for files and boards
```

## Tools

- `muster_render_full_file(cwd, path)` — reads the complete working file and `HEAD` version, returns diff statistics and a safe codebase index, and renders the file UI.
- `muster_prepare_board(cwd, tasks)` — creates a dependency-aware board without starting work.
- `muster_render_board(cwd)` — renders the current board.
- `muster_transition_task(...)` — enforces legal, evidence-backed transitions.

## Install from the personal marketplace

This repository is designed to be installed through Codex's standard plugin marketplace flow. No Codex app files are changed.

```bash
codex plugin add muster-codex-plugin@personal
```

Start a new Codex task after installation so the new skills, hooks, and MCP tools are loaded.

## Usage

```text
$muster-live Fix the flaky observer test and show every complete changed file.
```

```text
$muster-board Build the backend endpoint, add the client integration, then run CI.
```

```text
$muster-live $muster-board Implement these independent tasks visibly and keep the board evidence-backed.
```

## Host placement

The plugin uses the standard MCP Apps UI returned by MCP tools. Codex controls whether that UI appears inline or in another supported presentation. The plugin deliberately does not patch native sidebars or renderer internals, keeping it resilient to Codex updates.

## Development

```bash
npm install
npm run validate
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
```

See [docs/PRODUCT_CONTRACT.md](docs/PRODUCT_CONTRACT.md) for the approved behavior and [docs/HOST_BOUNDARY.md](docs/HOST_BOUNDARY.md) for the non-invasive integration boundary.

# Host integration boundary

The standard Muster Live Work plugin uses only documented Codex plugin surfaces:

- skills;
- plugin-bundled lifecycle hooks;
- a local stdio MCP server;
- MCP App UI resources returned by tools.

It does not modify the Codex application bundle, native renderer, project or thread database, rollout files, updater, or configuration.

Codex owns native placement and rendering of plugin UI. The plugin can request and provide inline/fullscreen-capable MCP App content, but it does not assume or patch an undocumented sidebar API. This boundary is what prevents the plugin from breaking later Codex updates.

## Optional desktop companion

Existing tasks cannot hot-load newly installed MCP tools. For that case, the repository includes an explicitly launched local companion. It:

- launches the signed Codex application unchanged;
- binds Chromium debugging to loopback only;
- reads `state_5.sqlite` and the active task rollout as read-only inputs;
- reads Git state and complete changed files without writing to the workspace;
- injects ephemeral DOM into the current renderer;
- never writes the task database, rollout, app bundle, updater, configuration, or repository.

This is an experimental compatibility layer, not a documented Codex extension point. Its selectors are isolated in `companion/renderer.js` so compatibility fixes do not require app or task migration.

# Host integration boundary

Muster Live Work uses only documented Codex plugin surfaces:

- skills;
- plugin-bundled lifecycle hooks;
- a local stdio MCP server;
- MCP App UI resources returned by tools.

It does not modify the Codex application bundle, native renderer, project or thread database, rollout files, updater, or configuration.

Codex owns native placement and rendering of plugin UI. The plugin can request and provide inline/fullscreen-capable MCP App content, but it does not assume or patch an undocumented sidebar API. This boundary is what prevents the plugin from breaking later Codex updates.

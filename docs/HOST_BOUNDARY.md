# Host integration boundary

Muster Live Work uses only documented Codex plugin surfaces:

- skills;
- plugin-bundled lifecycle hooks;
- a local stdio MCP server;
- MCP App UI resources returned by tools.

It does not modify the Codex application bundle, native renderer, project or thread database, rollout files, updater, or configuration.

Codex owns native placement and rendering of plugin UI. The plugin can request and provide inline/fullscreen-capable MCP App content, but it does not assume or patch an undocumented sidebar API. This boundary is what prevents the plugin from breaking later Codex updates.

The execution timeline is real-time only while its MCP App is open. Documented `PreToolUse` and `PostToolUse` hooks persist events; the app polls those records through the local MCP server. The plugin does not intercept, wrap, delay beyond hook execution, or replace Codex's native tool runner.

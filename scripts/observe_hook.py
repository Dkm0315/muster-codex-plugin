#!/usr/bin/env python3
"""Record explicitly enabled Muster turn events without mutating the workspace."""

from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

MAX_VALUE_CHARS = 64_000
SAFE_ID = re.compile(r"[^A-Za-z0-9._-]+")
ACTIVATION = re.compile(
    r"(?:^|\s)\$muster-live\b|plugin://muster-codex-plugin@personal|Muster Live Work",
    re.I,
)
BOARD_ACTIVATION = re.compile(r"(?:^|\s)\$muster-board\b", re.I)
DEACTIVATION = re.compile(r"(?:^|\s)\$muster-off\b", re.I)
SECRET_PATTERNS = (
    re.compile(r"(?i)((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*)[^\s\"']+"),
    re.compile(r"\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
)


def read_event() -> dict[str, Any]:
    try:
        value = json.load(sys.stdin)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def data_root() -> Path:
    configured = os.environ.get("PLUGIN_DATA")
    if configured:
        return Path(configured).expanduser().resolve()
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()
    return (codex_home / "state" / "plugins" / "muster-codex-plugin").resolve()


def session_key(event: dict[str, Any]) -> str:
    raw = str(event.get("session_id") or "unknown")
    return SAFE_ID.sub("-", raw)[:120] or "unknown"


def redact_text(value: str) -> str:
    text = value
    for index, pattern in enumerate(SECRET_PATTERNS):
        replacement = r"\1[REDACTED]" if index == 0 else "[REDACTED]"
        text = pattern.sub(replacement, text)
    return text


def compact(value: Any) -> Any:
    if isinstance(value, str):
        redacted = redact_text(value)
        return redacted if len(redacted) <= MAX_VALUE_CHARS else redacted[:MAX_VALUE_CHARS] + "…"
    if isinstance(value, list):
        return [compact(item) for item in value[:200]]
    if isinstance(value, dict):
        return {str(key): compact(item) for key, item in list(value.items())[:200]}
    return value


def git_changed_files(cwd: str) -> list[str]:
    root = Path(cwd)
    if not root.is_dir():
        return []
    commands = [
        ["git", "diff", "--name-only", "--"],
        ["git", "diff", "--cached", "--name-only", "--"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    ]
    changed: set[str] = set()
    for command in commands:
        try:
            result = subprocess.run(
                command,
                cwd=root,
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
        except Exception:
            continue
        if result.returncode == 0:
            changed.update(line.strip() for line in result.stdout.splitlines() if line.strip())
    return sorted(changed)[:500]


def load_modes(root: Path, key: str) -> dict[str, bool]:
    path = root / "sessions" / f"{key}.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"live": False, "board": False}
    return {"live": bool(value.get("live")), "board": bool(value.get("board"))}


def save_modes(root: Path, key: str, modes: dict[str, bool]) -> None:
    path = root / "sessions" / f"{key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(modes, indent=2) + "\n", encoding="utf-8")


def tool_event_id(event: dict[str, Any]) -> str:
    raw = str(
        event.get("tool_use_id")
        or event.get("tool_call_id")
        or event.get("tool_id")
        or ""
    )
    if raw:
        return SAFE_ID.sub("-", raw)[:160]
    stable = json.dumps(
        {
            "turn": event.get("turn_id"),
            "tool": event.get("tool_name"),
            "input": compact(event.get("tool_input")),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    import hashlib

    return "tool-" + hashlib.sha256(stable.encode("utf-8")).hexdigest()[:24]


def append_event(root: Path, key: str, payload: dict[str, Any]) -> None:
    path = root / "events" / f"{key}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")


def context_output(event_name: str, text: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": event_name,
                    "additionalContext": text,
                }
            }
        )
    )


def main() -> int:
    event = read_event()
    if not event:
        return 0

    root = data_root()
    key = session_key(event)
    event_name = str(event.get("hook_event_name") or "")
    cwd = str(event.get("cwd") or "")

    if event_name == "UserPromptSubmit":
        prompt = str(event.get("prompt") or "")
        previous = load_modes(root, key)
        disabled = bool(DEACTIVATION.search(prompt))
        modes = {
            "live": False if disabled else previous["live"] or bool(ACTIVATION.search(prompt)),
            "board": False if disabled else previous["board"] or bool(BOARD_ACTIVATION.search(prompt)),
        }
        save_modes(root, key, modes)
        append_event(
            root,
            key,
            {
                "at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "event": event_name,
                "turnId": event.get("turn_id"),
                "cwd": cwd,
                "modes": modes,
            },
        )
        instructions: list[str] = []
        if modes["live"]:
            instructions.append(
                "Muster Live is active for this task. Before other tool work, call muster_render_activity once so its live timeline remains visible. "
                "Preserve native command output and edit events. "
                "After every file mutation, call muster_render_full_file for every changed text file so the entire file is visible."
            )
        if modes["board"]:
            instructions.append(
                "Muster Board is explicitly active for this turn. Extract concrete tasks from this prompt, call muster_prepare_board "
                "with an empty array when none exist, then call muster_render_board. Do not start work merely because a board exists."
            )
        if instructions:
            context_output(event_name, " ".join(instructions))
        return 0

    modes = load_modes(root, key)
    if not modes.get("live") and not modes.get("board"):
        return 0
    if "muster_render_activity" in str(event.get("tool_name") or ""):
        return 0
    changed = git_changed_files(cwd) if event_name == "PostToolUse" else []
    phase = "before" if event_name == "PreToolUse" else "after"
    status = "running" if phase == "before" else "completed"
    append_event(
        root,
        key,
        {
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "event": event_name,
            "turnId": event.get("turn_id"),
            "activityId": tool_event_id(event),
            "phase": phase,
            "status": status,
            "cwd": cwd,
            "toolName": event.get("tool_name"),
            "toolInput": compact(event.get("tool_input")),
            "toolResponse": compact(event.get("tool_response")),
            "changedFiles": changed,
            "modes": modes,
        },
    )

    if modes.get("live") and event_name == "PreToolUse":
        context_output(
            event_name,
            "Muster Live recorded this action before execution. Keep the live activity surface open; it will update from the post-tool event.",
        )
        return 0

    if modes.get("live") and changed:
        paths = ", ".join(changed)
        context_output(
            event_name,
            "Muster Live observed changed files: " + paths + ". Immediately call muster_render_full_file for each changed text file. "
            "Do not hide or replace the native command output or edit event.",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

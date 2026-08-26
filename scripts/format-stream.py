#!/usr/bin/env python3
"""
Turn `claude --output-format stream-json` NDJSON into a readable log.

The nightly run used to write nothing until it exited, so a twelve-minute
extraction looked identical to a hang. This prints a timestamped line per event
as it arrives, flushing each one.

Unrecognised or malformed lines are ignored rather than fatal: logging must
never be the thing that fails a run.
"""
import json
import sys
from datetime import datetime


def stamp() -> str:
    return datetime.now().strftime("%H:%M:%S")


def emit(text: str) -> None:
    print(f"  {stamp()} {text}", flush=True)


def brief(value, limit: int = 110) -> str:
    text = " ".join(str(value).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
    except ValueError:
        continue

    kind = event.get("type")

    if kind == "system" and event.get("subtype") == "init":
        emit(f"session {event.get('session_id', '?')[:8]} started")

    elif kind == "assistant":
        for block in event.get("message", {}).get("content", []):
            if block.get("type") == "text" and block.get("text", "").strip():
                emit(brief(block["text"], 400))
            elif block.get("type") == "tool_use":
                name = block.get("name", "?")
                args = block.get("input", {}) or {}
                # Show the argument that identifies what the call is doing.
                for key in ("url", "command", "description", "text", "file_path"):
                    if key in args:
                        emit(f"-> {name}: {brief(args[key])}")
                        break
                else:
                    emit(f"-> {name}")

    elif kind == "result" or "is_error" in event:
        err = event.get("is_error")
        turns = event.get("num_turns")
        cost = event.get("total_cost_usd")
        secs = (event.get("duration_api_ms") or 0) / 1000
        emit(
            f"result: {'ERROR' if err else 'ok'} "
            f"turns={turns} api={secs:.0f}s"
            + (f" cost=${cost:.2f}" if isinstance(cost, (int, float)) else "")
        )

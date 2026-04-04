"""Shared MD-file context system for LLM-driven agent coordination.

Every agent and the orchestrator brain read/write markdown files in
``runtime/context/`` so that MiniMax M2.7 can reason across the swarm.

Files are dual-written: local MD files for fast LLM prompt assembly, and
InsForge ``agent_memory`` table for persistence, crash recovery, and
real-time observability across agents.

Files
-----
* ``mission.md``            – objective + user idea (written once)
* ``strategy.md``           – orchestrator strategy (updated periodically)
* ``discoveries.md``        – aggregated findings from all agents
* ``business_plan.md``      – structured business plan (updated periodically)
* ``agent-{id}.md``         – per-agent learning journal
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTEXT_DIR = Path(os.getenv("MASTERBUILD_CONTEXT_DIR", Path(__file__).resolve().parent / "runtime" / "context"))

# ── InsForge memory sync state ────────────────────────────────────────
# Set by the orchestrator at startup via configure_insforge_sync()
_insforge_client: Any | None = None
_mission_id: str | None = None
AGENT_COUNT = int(os.getenv("MASTERBUILD_AGENT_COUNT", "5"))


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def _ensure_dir() -> None:
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)


# ── InsForge sync configuration ──────────────────────────────────────

def configure_insforge_sync(client: Any, mission_id: str) -> None:
    """Call once at mission start to enable dual-write to InsForge."""
    global _insforge_client, _mission_id
    _insforge_client = client
    _mission_id = mission_id


def disable_insforge_sync() -> None:
    """Disable InsForge sync (e.g. on mission end)."""
    global _insforge_client, _mission_id
    _insforge_client = None
    _mission_id = None


async def _sync_to_insforge(filename: str, content: str, *, updated_by: str = "orchestrator") -> None:
    """Upsert a context file into the InsForge agent_memory table."""
    if _insforge_client is None or _mission_id is None:
        return
    try:
        # Try update first
        existing = await _insforge_client.list_records(
            "agent_memory",
            params={"mission_id": f"eq.{_mission_id}", "filename": f"eq.{filename}", "limit": 1},
        )
        if existing:
            record = existing[0]
            new_version = int(record.get("version", 0)) + 1
            await _insforge_client.update_records(
                "agent_memory",
                filters={"id": f"eq.{record['id']}"},
                values={"content": content, "version": new_version, "updated_by": updated_by},
            )
        else:
            await _insforge_client.insert_records(
                "agent_memory",
                [{
                    "mission_id": _mission_id,
                    "filename": filename,
                    "content": content,
                    "version": 1,
                    "updated_by": updated_by,
                }],
            )
    except Exception as e:
        print(f"[agent_context] InsForge sync error for {filename}: {e}")


def _fire_sync(filename: str, content: str, updated_by: str = "orchestrator") -> None:
    """Schedule an InsForge sync without blocking the caller."""
    if _insforge_client is None:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_sync_to_insforge(filename, content, updated_by=updated_by))
    except RuntimeError:
        pass  # No event loop — skip sync (e.g. during tests)


async def hydrate_from_insforge(client: Any, mission_id: str) -> int:
    """Pull all agent_memory rows for a mission and write them to local MD files.

    Returns the number of files hydrated. Call on startup for crash recovery.
    """
    _ensure_dir()
    try:
        rows = await client.list_records(
            "agent_memory",
            params={"mission_id": f"eq.{mission_id}", "order": "filename.asc"},
        )
        for row in rows:
            filename = str(row.get("filename", ""))
            content = str(row.get("content", ""))
            if filename:
                (CONTEXT_DIR / filename).write_text(content, encoding="utf-8")
        return len(rows)
    except Exception as e:
        print(f"[agent_context] hydrate error: {e}")
        return 0


# ── Atomic read / write helpers ──────────────────────────────────────

def read_md(filename: str) -> str:
    path = CONTEXT_DIR / filename
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return ""


def write_md(filename: str, content: str, *, updated_by: str = "orchestrator") -> None:
    _ensure_dir()
    (CONTEXT_DIR / filename).write_text(content, encoding="utf-8")
    _fire_sync(filename, content, updated_by)


def append_md(filename: str, block: str, *, updated_by: str = "orchestrator") -> None:
    _ensure_dir()
    path = CONTEXT_DIR / filename
    with open(path, "a", encoding="utf-8") as f:
        f.write(block)
    # Read back the full content for sync
    full_content = path.read_text(encoding="utf-8")
    _fire_sync(filename, full_content, updated_by)


# ── Mission context ──────────────────────────────────────────────────

def init_mission_context(prompt: str, agent_specs: list[dict[str, Any]]) -> None:
    """Write the initial mission.md, business_plan.md, and empty per-agent files."""
    _ensure_dir()
    agents_section = "\n".join(
        f"- **Agent {s['agent_id']}** ({s['name']}): {s['platform']} / {s['role']}"
        for s in agent_specs
    )
    write_md("mission.md", (
        f"# Mission\n\n"
        f"**Objective:** {prompt}\n\n"
        f"**Started:** {_ts()} UTC\n\n"
        f"## Agents\n\n{agents_section}\n"
    ))
    write_md("discoveries.md", "# Discoveries\n\n_None yet._\n")
    write_md("strategy.md", (
        "# Strategy\n\n"
        "Phase: **Initial Exploration**\n\n"
        "All agents: run your first search and report what you find.\n"
    ))
    write_md("business_plan.md", (
        "# Business Plan\n\n"
        f"**Idea:** {prompt}\n\n"
        "## Market Opportunity\n\n_Pending research..._\n\n"
        "## Competitive Landscape\n\n_Pending research..._\n\n"
        "## Revenue Models\n\n_Pending research..._\n\n"
        "## User Acquisition\n\n_Pending research..._\n\n"
        "## Risk & Moat Analysis\n\n_Pending research..._\n"
    ))
    for s in agent_specs:
        write_md(f"agent-{s['agent_id']}.md", (
            f"# Agent {s['agent_id']} — {s['name']}\n\n"
            f"**Platform:** {s['platform']}  \n"
            f"**Role:** {s['role']}\n\n"
            f"## Actions\n\n"
        ), updated_by=f"agent-{s['agent_id']}")


# ── Per-agent context updates ────────────────────────────────────────

def log_agent_action(agent_id: int, action: str, detail: str) -> None:
    append_md(f"agent-{agent_id}.md", f"- [{_ts()}] **{action}**: {detail}\n", updated_by=f"agent-{agent_id}")


def log_agent_observation(agent_id: int, url: str, title: str, snippet: str, page_content: str = "") -> None:
    lines = [
        f"\n### [{_ts()}] Observation\n",
        f"- **URL:** {url}\n",
        f"- **Title:** {title}\n",
        f"- **Snippet:** {snippet}\n",
    ]
    if page_content:
        # Store a concise excerpt — enough for the LLM to reason about, not so much it bloats the context
        excerpt = page_content[:600].replace("\n", " ").strip()
        lines.append(f"- **Content:** {excerpt}\n")
    lines.append("\n")
    append_md(f"agent-{agent_id}.md", "".join(lines), updated_by=f"agent-{agent_id}")


def get_agent_context(agent_id: int) -> str:
    return read_md(f"agent-{agent_id}.md")


# ── Discovery log ────────────────────────────────────────────────────

def log_discovery(agent_id: int, platform: str, keywords: str, summary: str, url: str) -> None:
    block = (
        f"\n### Agent {agent_id} ({platform}) — {_ts()}\n"
        f"- **Keywords:** {keywords}\n"
        f"- **Summary:** {summary}\n"
        f"- **URL:** {url}\n"
    )
    append_md("discoveries.md", block, updated_by=f"agent-{agent_id}")


# ── Strategy ─────────────────────────────────────────────────────────

def get_strategy() -> str:
    return read_md("strategy.md")


def update_strategy(content: str) -> None:
    write_md("strategy.md", content, updated_by="orchestrator")


# ── Business Plan ────────────────────────────────────────────────────

def get_business_plan() -> str:
    return read_md("business_plan.md")


def update_business_plan(content: str) -> None:
    write_md("business_plan.md", content, updated_by="orchestrator")


# ── Composite context for LLM prompts ────────────────────────────────

def build_agent_prompt_context(agent_id: int) -> str:
    """Build the full context an agent LLM call needs."""
    mission = read_md("mission.md")
    strategy = read_md("strategy.md")
    agent = read_md(f"agent-{agent_id}.md")
    discoveries = read_md("discoveries.md")
    business_plan = read_md("business_plan.md")
    # Trim discoveries to last 2000 chars to stay within token limits
    if len(discoveries) > 2000:
        discoveries = "...(earlier discoveries trimmed)...\n" + discoveries[-2000:]
    # Include business plan context (trimmed)
    if len(business_plan) > 1500:
        business_plan = "...(plan trimmed)...\n" + business_plan[-1500:]
    return (
        f"{mission}\n\n---\n\n{strategy}\n\n---\n\n{agent}"
        f"\n\n---\n\n{discoveries}\n\n---\n\n{business_plan}"
    )


def build_orchestrator_context() -> str:
    """Build the full context the orchestrator brain needs."""
    mission = read_md("mission.md")
    strategy = read_md("strategy.md")
    discoveries = read_md("discoveries.md")
    business_plan = read_md("business_plan.md")
    agent_summaries: list[str] = []
    for i in range(1, AGENT_COUNT + 1):
        text = read_md(f"agent-{i}.md")
        # Just the last 500 chars of each agent's journal
        if len(text) > 500:
            text = "...\n" + text[-500:]
        agent_summaries.append(text)
    agents_text = "\n\n---\n\n".join(agent_summaries)
    return (
        f"{mission}\n\n---\n\n{strategy}\n\n---\n\n{discoveries}"
        f"\n\n---\n\n{business_plan}\n\n---\n\n{agents_text}"
    )

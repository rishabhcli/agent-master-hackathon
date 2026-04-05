"""Tests for platform-native browser agent task prompts."""

from __future__ import annotations

import pytest

import agent_context
from masterbuild_runtime import AgentSpec, MasterBuildOrchestrator


@pytest.mark.parametrize(
    ("spec", "expected_phrases"),
    [
        (
            AgentSpec(1, "Echo", "youtube", "Video Scan"),
            [
                "Work YouTube like a curious operator doing audience research",
                "description links, pinned comments, and top comments",
            ],
        ),
        (
            AgentSpec(2, "Pulse", "x", "Conversation Scan"),
            [
                "Work X like a fast-moving operator scanning live demand",
                "likes, replies, reposts",
            ],
        ),
        (
            AgentSpec(3, "Thread", "reddit", "Community Scan"),
            [
                "Work Reddit like a patient researcher listening for detailed pain",
                "DIY scripts, spreadsheets, automations, or manual workarounds",
            ],
        ),
        (
            AgentSpec(4, "Ledger", "substack", "Narrative Scan"),
            [
                "Work Substack like a category analyst collecting market narratives",
                "Competitor names, pricing, category language, and positioning",
            ],
        ),
    ],
)
def test_build_agent_task_uses_platform_native_research_prompt(
    tmp_context_dir,
    spec: AgentSpec,
    expected_phrases: list[str],
):
    agent_context.disable_insforge_sync()
    agent_context.write_md("strategy.md", "# Strategy\n\n- Pressure-test the strongest buyer pain.\n")
    agent_context.write_md("business_plan.md", "# Business Plan\n\nFocus on urgent workflow pain and clear monetization.\n")

    orchestrator = MasterBuildOrchestrator.__new__(MasterBuildOrchestrator)
    task = MasterBuildOrchestrator._build_agent_task(
        orchestrator,
        spec,
        "Build a meeting intelligence product",
        ["meeting follow up pain", "meeting task automation"],
        [{"title": "Seed link", "url": "https://example.com"}],
    )

    assert "COLLABORATION CONTEXT:" in task
    assert "DISCOVERY QUALITY BAR:" in task
    assert "Lovable build brief" in task
    task_lower = task.lower()
    for phrase in expected_phrases:
        assert phrase.lower() in task_lower

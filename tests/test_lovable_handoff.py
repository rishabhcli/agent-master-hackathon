"""Tests for the MiniMax-first Lovable handoff payload."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

import agent_context
from masterbuild_runtime import (
    MasterBuildAI,
    MasterBuildOrchestrator,
    build_lovable_launch_url,
    build_lovable_prompt_from_plan,
    build_platform_coverage,
    filter_valid_discoveries,
    is_authenticated_x_url,
    is_x_auth_flow_url,
    is_valid_platform_content_url,
)


VALID_DISCOVERIES = [
    {
        "id": "yt-1",
        "platform": "youtube",
        "title": "AI meeting notes problem breakdown",
        "keywords": "meeting notes pain",
        "summary": "Creators and commenters complain about losing decisions after meetings.",
        "source_url": "https://www.youtube.com/watch?v=abc123",
    },
    {
        "id": "x-1",
        "platform": "x",
        "title": "I need a tool that turns meetings into tasks",
        "keywords": "meeting follow-up request",
        "summary": "Operators are explicitly asking for action-item extraction from meeting transcripts.",
        "source_url": "https://x.com/founder/status/12345",
    },
    {
        "id": "reddit-1",
        "platform": "reddit",
        "title": "Anyone paying for better meeting follow-up automation?",
        "keywords": "would pay for meeting automation",
        "summary": "Multiple buyers describe manual workarounds and willingness to pay.",
        "source_url": "https://www.reddit.com/r/SaaS/comments/abc123/anyone_paying_for_better_meeting_followup/",
    },
    {
        "id": "substack-1",
        "platform": "substack",
        "title": "Why meeting intelligence is becoming its own software category",
        "keywords": "meeting intelligence trend",
        "summary": "Analysts frame meeting intelligence as an emerging workflow category with pricing headroom.",
        "source_url": "https://operatorplaybook.substack.com/p/meeting-intelligence-category",
    },
]


class TestDiscoveryValidation:
    def test_platform_url_validation_rejects_homepages(self):
        assert not is_valid_platform_content_url("youtube", "https://www.youtube.com/")
        assert not is_valid_platform_content_url("x", "https://x.com/search?q=meetings")
        assert not is_valid_platform_content_url("reddit", "https://www.reddit.com/search/?q=meetings")
        assert not is_valid_platform_content_url("substack", "https://substack.com/search?query=meetings")

    def test_x_auth_flow_detection_rejects_password_reset(self):
        assert is_x_auth_flow_url("https://x.com/i/flow/password_reset?input_flow_data=abc")
        assert not is_authenticated_x_url("https://x.com/i/flow/password_reset?input_flow_data=abc")
        assert is_authenticated_x_url("https://x.com/home")
        assert is_authenticated_x_url("https://x.com/search?q=meetings&f=live")

    def test_filter_valid_discoveries_keeps_only_content_urls(self):
        discoveries = VALID_DISCOVERIES + [
            {
                "id": "bad-1",
                "platform": "youtube",
                "title": "youtube.com",
                "keywords": "bad",
                "summary": "youtube.com",
                "source_url": "https://www.youtube.com/",
            }
        ]

        filtered = filter_valid_discoveries(discoveries)
        assert len(filtered) == 4
        assert {item["platform"] for item in filtered} == {"youtube", "x", "reddit", "substack"}

    def test_build_platform_coverage_requires_all_four_platforms(self):
        filtered = filter_valid_discoveries(VALID_DISCOVERIES[:3])
        coverage = build_platform_coverage(filtered)

        assert coverage["readyForLovable"] is False
        assert coverage["completedPlatforms"] == ["reddit", "x", "youtube"]
        assert coverage["missingPlatforms"] == ["substack"]


class TestMiniMaxImplementationPlan:
    @pytest.mark.asyncio
    async def test_generate_finalized_implementation_plan_returns_structured_payload(self):
        ai = MasterBuildAI.__new__(MasterBuildAI)
        ai.model = "test-model"
        ai._client = None
        ai._insforge_client = None
        ai._mission_id = None
        ai.generate_chat_completion = AsyncMock(
            return_value=json.dumps(
                {
                    "title": "Meeting Command Center",
                    "one_liner": "Turn every meeting into tasks, owners, and next steps.",
                    "problem": "Teams lose decisions and action items after meetings.",
                    "target_users": "Operations-heavy startup teams",
                    "value_prop": "Convert messy calls into accountable follow-up instantly.",
                    "why_now": "AI adoption and remote work create urgency for structured follow-up.",
                    "core_user_flows": ["Connect source", "Review output", "Sync tasks"],
                    "screens": [{"name": "Dashboard", "purpose": "Review work", "modules": ["Inbox", "Summary"]}],
                    "data_model": [{"entity": "meetings", "purpose": "Store meeting outputs", "fields": ["title", "date"]}],
                    "workflows": [{"name": "Task sync", "trigger": "Approval", "outcome": "Tasks created"}],
                    "integrations": ["Calendar", "Task manager"],
                    "monetization": "Per-seat subscription",
                    "launch_plan": ["Pilot with 10 teams"],
                    "success_metrics": ["Weekly retained teams"],
                    "lovable_prompt": "Build an MVP meeting follow-up app for startup operators.",
                }
            )
        )

        result = await ai.generate_finalized_implementation_plan(
            "Build a meeting intelligence app",
            {"title": "Meeting Command Center", "concept": "Meeting follow-up automation"},
            VALID_DISCOVERIES,
            "# Business Plan\n\nValidated idea",
        )

        assert result["title"] == "Meeting Command Center"
        assert result["lovable_prompt"].startswith("Build an MVP")
        assert result["screens"][0]["name"] == "Dashboard"


class TestLovablePromptBuilder:
    def test_build_lovable_prompt_from_plan_returns_structured_build_brief(self):
        prompt = build_lovable_prompt_from_plan(
            {
                "title": "Meeting Command Center",
                "oneLiner": "Turn every meeting into tasks, owners, and next steps.",
                "problem": "Teams lose decisions after calls.",
                "targetUsers": "Startup operators",
                "valueProp": "Convert calls into action instantly.",
                "whyNow": "AI makes structured follow-up newly possible.",
                "coreUserFlows": ["Connect source", "Review output", "Sync tasks"],
                "screens": [{"name": "Dashboard", "purpose": "Review work", "modules": ["Inbox", "Summary"]}],
                "dataModel": [{"entity": "meetings", "purpose": "Store outputs", "fields": ["title", "date"]}],
                "workflows": [{"name": "Task sync", "trigger": "Approval", "outcome": "Tasks created"}],
                "integrations": ["Calendar", "Task manager"],
                "monetization": "Per-seat subscription",
                "launchPlan": ["Ship pilot", "Invite design partners"],
                "successMetrics": ["Activation rate", "Retained teams"],
                "sourceEvidence": [
                    {
                        "id": "yt-1",
                        "platform": "youtube",
                        "title": "AI meeting notes problem breakdown",
                        "keywords": "meeting notes pain",
                        "summary": "Creators and commenters complain about losing decisions after meetings.",
                        "url": "https://www.youtube.com/watch?v=abc123",
                    }
                ],
            },
            prompt_seed="Build an MVP meeting follow-up app for startup operators.",
        )

        assert "Product foundation:" in prompt
        assert "Required screens and modules:" in prompt
        assert "Core data model:" in prompt
        assert "Research signals to respect:" in prompt
        assert "Build quality bar:" in prompt


class TestFinalOptionsPayload:
    @pytest.mark.asyncio
    async def test_build_final_options_payload_includes_lovable_handoff(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.write_md("business_plan.md", "# Business Plan\n\nValidated idea with demand.\n")

        orchestrator = MasterBuildOrchestrator.__new__(MasterBuildOrchestrator)
        orchestrator.ai = MagicMock()
        orchestrator.ai.generate_market_research_report = AsyncMock(
            return_value={
                "market_research_summary": "Cross-platform research supports a meeting follow-up product.",
                "key_signals": ["buyers complain about manual follow-up", "analysts see category growth"],
                "options": [
                    {
                        "title": "Meeting Command Center",
                        "concept": "Turn meetings into accountable tasks and recaps.",
                        "audience": "Startup operators",
                        "why_promising": "Users repeatedly complain about losing next steps.",
                        "market_angle": "Position as the workflow layer after transcription.",
                        "recommended_format": "Workflow MVP",
                        "evidence_ids": [item["id"] for item in VALID_DISCOVERIES],
                    },
                    {
                        "title": "Executive Briefs",
                        "concept": "Summaries for leadership",
                        "audience": "Executives",
                        "why_promising": "Leaders want concise updates.",
                        "market_angle": "Weekly digest",
                        "recommended_format": "Analytics tool",
                        "evidence_ids": ["yt-1", "x-1"],
                    },
                    {
                        "title": "Post-Meeting CRM Sync",
                        "concept": "Push follow-up into CRM",
                        "audience": "Revenue teams",
                        "why_promising": "Revenue ops teams need follow-through.",
                        "market_angle": "CRM workflow",
                        "recommended_format": "Ops add-on",
                        "evidence_ids": ["reddit-1", "substack-1"],
                    },
                ],
            }
        )
        orchestrator.ai.generate_finalized_implementation_plan = AsyncMock(
            return_value={
                "title": "Meeting Command Center",
                "one_liner": "Turn every meeting into tasks, owners, and next steps.",
                "problem": "Teams lose decisions after calls.",
                "target_users": "Startup operators",
                "value_prop": "Convert calls into action instantly.",
                "why_now": "AI makes structured follow-up newly possible.",
                "core_user_flows": ["Connect source", "Review output", "Share results"],
                "screens": [{"name": "Dashboard", "purpose": "Review work", "modules": ["Inbox", "Summary"]}],
                "data_model": [{"entity": "meetings", "purpose": "Store outputs", "fields": ["title", "date"]}],
                "workflows": [{"name": "Task sync", "trigger": "Approval", "outcome": "Tasks created"}],
                "integrations": ["Calendar", "Task manager"],
                "monetization": "Per-seat subscription",
                "launch_plan": ["Ship pilot", "Invite design partners"],
                "success_metrics": ["Activation rate", "Retained teams"],
                "lovable_prompt": "Build an MVP meeting follow-up app for startup operators with dashboard, meeting inbox, task sync, and per-seat pricing.",
            }
        )

        payload = await MasterBuildOrchestrator._build_final_options_payload(
            orchestrator,
            "Build a meeting intelligence app",
            VALID_DISCOVERIES,
            is_final=True,
        )

        assert payload["coverage"]["readyForLovable"] is True
        assert payload["primaryOptionId"] == "option-1"
        assert payload["implementationPlan"]["generatedBy"] == "MiniMax-M2.7"
        assert payload["implementationPlan"]["title"] == "Meeting Command Center"
        assert len(payload["implementationPlan"]["sourceEvidence"]) == 4
        assert {item["platform"] for item in payload["lovableHandoff"]["evidence"]} == {"youtube", "x", "reddit", "substack"}
        assert payload["lovableHandoff"]["launchUrl"].startswith("https://lovable.dev/")
        assert "Required screens and modules:" in payload["lovableHandoff"]["prompt"]
        assert "Core data model:" in payload["lovableHandoff"]["prompt"]
        assert "Build quality bar:" in payload["lovableHandoff"]["prompt"]

    def test_build_lovable_launch_url_encodes_prompt(self):
        url = build_lovable_launch_url("Build an MVP app for team notes")
        assert url.startswith("https://lovable.dev/?autosubmit=true#prompt=")
        assert "Build%20an%20MVP%20app%20for%20team%20notes" in url

    def test_build_lovable_launch_url_preserves_line_breaks(self):
        url = build_lovable_launch_url("Build an MVP app\n\nProduct foundation:")
        assert "%0A%0AProduct%20foundation%3A" in url

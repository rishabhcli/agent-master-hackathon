"""Tests for builder_agent.py: staged pipeline, report generation, error handling."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import agent_context
from builder_agent import BuilderAgent, STAGES


@pytest.fixture()
def builder(tmp_context_dir, mock_ai, mock_insforge_client):
    """Create a BuilderAgent with mocked dependencies."""
    agent_context.disable_insforge_sync()
    # Write a business plan so the builder can read it
    agent_context.write_md("business_plan.md", (
        "# Business Plan (v3)\n\n"
        "**Idea:** Test SaaS app\n"
        "**Confidence:** 55%\n\n"
        "## Market Opportunity\n\nLarge market for project management tools.\n\n"
        "## Revenue Models\n\nSaaS subscription $10/mo.\n"
    ))
    agent_context.write_md("agent-6.md", "# Agent 6 — Forge\n\n## Actions\n\n")
    return BuilderAgent(mock_ai, mock_insforge_client, "mission-test", "Build a PM tool")


class TestBuilderStages:
    """Test individual stage execution."""

    @pytest.mark.asyncio
    async def test_run_full_pipeline(self, builder, mock_ai):
        """Builder should execute all 5 stages and produce outputs."""
        # Mock AI to return valid JSON for each stage
        mock_ai.generate_chat_completion = AsyncMock(return_value=json.dumps({
            "tables": [{"name": "projects", "columns": [], "description": "Project table"}],
            "sql": "CREATE TABLE projects (id uuid primary key);",
            "reasoning": "Projects are core",
            "pages": [{"route": "/", "title": "Dashboard", "description": "Main", "components": []}],
            "components": [],
            "auth_required": True,
            "tech_stack": {"framework": "Next.js"},
            "features": [{"name": "Auth", "description": "Login", "priority": 1, "insforge_services": ["auth"], "implementation_notes": ""}],
            "mvp_features": ["Auth"],
            "insforge_config": {},
            "deployment_steps": [],
            "environment_variables": [],
            "estimated_cost": "$0",
            "go_live_checklist": [],
            "pricing_tiers": [],
            "revenue_streams": [],
            "payment_integration": {},
            "growth_levers": [],
            "unit_economics": {},
        }))

        stop_event = asyncio.Event()
        outputs = await builder.run(stop_event)

        # Should have outputs for all stages
        for stage in STAGES:
            assert stage in outputs, f"Missing output for stage: {stage}"

    @pytest.mark.asyncio
    async def test_run_stops_when_event_set(self, builder, mock_ai):
        """Builder should stop early if stop_event is set."""
        mock_ai.generate_chat_completion = AsyncMock(return_value='{"tables": [], "sql": "", "reasoning": "test"}')

        stop_event = asyncio.Event()
        stop_event.set()  # Already stopped

        outputs = await builder.run(stop_event)
        # Should have no outputs since we stopped immediately
        assert len(outputs) == 0

    @pytest.mark.asyncio
    async def test_run_skips_without_business_plan(self, tmp_context_dir, mock_ai, mock_insforge_client):
        """Builder should return error if business plan is not ready."""
        agent_context.disable_insforge_sync()
        agent_context.write_md("business_plan.md", "# Business Plan\n\n_Pending research..._\n")
        agent_context.write_md("agent-6.md", "# Agent 6\n\n## Actions\n\n")

        builder = BuilderAgent(mock_ai, mock_insforge_client, "m-1", "test")
        stop_event = asyncio.Event()
        outputs = await builder.run(stop_event)

        assert "error" in outputs
        assert "not ready" in outputs["error"]

    @pytest.mark.asyncio
    async def test_stage_error_handling(self, builder, mock_ai, mock_insforge_client):
        """Builder should log errors and continue to next stages."""
        # Make the AI raise an exception
        mock_ai.generate_chat_completion = AsyncMock(side_effect=Exception("API timeout"))

        stop_event = asyncio.Event()
        outputs = await builder.run(stop_event)

        # Should have attempted all stages but they all errored
        # The builder_report.md should still be written
        report = agent_context.read_md("builder_report.md")
        assert "Builder Report" in report


class TestBuilderReport:
    """Test report generation."""

    @pytest.mark.asyncio
    async def test_report_written_after_run(self, builder, mock_ai):
        """After run(), builder_report.md should exist with stage summaries."""
        mock_ai.generate_chat_completion = AsyncMock(return_value='{"tables": [], "sql": "", "reasoning": "test"}')

        stop_event = asyncio.Event()
        await builder.run(stop_event)

        report = agent_context.read_md("builder_report.md")
        assert "# Builder Report" in report
        assert "Schema" in report


class TestBuilderInsForgeIntegration:
    """Test that builder writes to InsForge tables."""

    @pytest.mark.asyncio
    async def test_stage_status_updates(self, builder, mock_ai, mock_insforge_client):
        """Builder should write to builder_outputs for each stage."""
        mock_ai.generate_chat_completion = AsyncMock(return_value='{"tables": [], "sql": "", "reasoning": "ok"}')

        stop_event = asyncio.Event()
        await builder.run(stop_event)

        # Should have called insert_records for builder_outputs
        insert_calls = mock_insforge_client.insert_records.call_args_list
        assert len(insert_calls) > 0
        # At least some calls should be for builder_outputs
        builder_calls = [c for c in insert_calls if c[0][0] == "builder_outputs"]
        assert len(builder_calls) >= 1

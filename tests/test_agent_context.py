"""Tests for agent_context.py: dual-write, business plan, InsForge sync."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, call

import pytest

import agent_context


class TestBasicReadWrite:
    """Test local MD file operations."""

    def test_write_and_read(self, tmp_context_dir):
        agent_context.write_md("test.md", "hello world")
        assert agent_context.read_md("test.md") == "hello world"

    def test_read_nonexistent_returns_empty(self, tmp_context_dir):
        assert agent_context.read_md("missing.md") == ""

    def test_append_md(self, tmp_context_dir):
        agent_context.write_md("log.md", "line1\n")
        agent_context.append_md("log.md", "line2\n")
        assert agent_context.read_md("log.md") == "line1\nline2\n"


class TestInsForgeSync:
    """Test dual-write to InsForge."""

    def test_configure_and_disable(self, tmp_context_dir, mock_insforge_client):
        agent_context.configure_insforge_sync(mock_insforge_client, "mission-123")
        assert agent_context._insforge_client is mock_insforge_client
        assert agent_context._mission_id == "mission-123"

        agent_context.disable_insforge_sync()
        assert agent_context._insforge_client is None
        assert agent_context._mission_id is None

    def test_write_md_fires_sync(self, tmp_context_dir, mock_insforge_client):
        """write_md should trigger InsForge sync when configured."""
        agent_context.configure_insforge_sync(mock_insforge_client, "m-1")

        # Run in event loop so fire_sync can schedule the task
        async def _run():
            agent_context.write_md("strategy.md", "# Strategy\nPhase 1")
            # Allow the fire-and-forget task to execute
            await asyncio.sleep(0.05)

        asyncio.run(_run())

        # Should have called list_records to check for existing, then insert
        assert mock_insforge_client.list_records.called
        agent_context.disable_insforge_sync()

    def test_write_md_no_sync_when_disabled(self, tmp_context_dir, mock_insforge_client):
        """write_md should NOT call InsForge when sync is disabled."""
        agent_context.disable_insforge_sync()
        agent_context.write_md("test.md", "content")
        assert not mock_insforge_client.list_records.called

    @pytest.mark.asyncio
    async def test_hydrate_from_insforge(self, tmp_context_dir, mock_insforge_client):
        """hydrate_from_insforge should write DB rows to local files."""
        mock_insforge_client.list_records = AsyncMock(return_value=[
            {"filename": "mission.md", "content": "# Hydrated Mission"},
            {"filename": "agent-1.md", "content": "# Agent 1 Journal"},
        ])

        count = await agent_context.hydrate_from_insforge(mock_insforge_client, "m-1")

        assert count == 2
        assert agent_context.read_md("mission.md") == "# Hydrated Mission"
        assert agent_context.read_md("agent-1.md") == "# Agent 1 Journal"

    @pytest.mark.asyncio
    async def test_hydrate_handles_errors(self, tmp_context_dir, mock_insforge_client):
        """hydrate should return 0 on errors, not crash."""
        mock_insforge_client.list_records = AsyncMock(side_effect=Exception("DB down"))
        count = await agent_context.hydrate_from_insforge(mock_insforge_client, "m-1")
        assert count == 0


class TestBusinessPlan:
    """Test business plan MD operations."""

    def test_init_creates_business_plan(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.init_mission_context("Build a SaaS tool", [
            {"agent_id": 1, "name": "Echo", "platform": "youtube", "role": "Content Scout"},
        ])
        bp = agent_context.get_business_plan()
        assert "Build a SaaS tool" in bp
        assert "Market Opportunity" in bp
        assert "Revenue Models" in bp

    def test_update_business_plan(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.write_md("business_plan.md", "initial")
        agent_context.update_business_plan("# Updated Plan\n\nNew content")
        assert "Updated Plan" in agent_context.get_business_plan()

    def test_build_agent_prompt_includes_business_plan(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.init_mission_context("Test idea", [
            {"agent_id": 1, "name": "Echo", "platform": "youtube", "role": "Scout"},
        ])
        agent_context.update_business_plan("# Plan v1\nSome content here")
        ctx = agent_context.build_agent_prompt_context(1)
        assert "Plan v1" in ctx

    def test_build_orchestrator_context_includes_business_plan(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.init_mission_context("Test idea", [
            {"agent_id": 1, "name": "Echo", "platform": "youtube", "role": "Scout"},
        ])
        agent_context.update_business_plan("# Plan v2\nRefined plan")
        ctx = agent_context.build_orchestrator_context()
        assert "Plan v2" in ctx


class TestAgentActions:
    """Test agent-specific context logging."""

    def test_log_agent_action(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.write_md("agent-1.md", "# Agent 1\n\n## Actions\n\n")
        agent_context.log_agent_action(1, "search", "Searching for SaaS tools")
        content = agent_context.read_md("agent-1.md")
        assert "search" in content
        assert "SaaS tools" in content

    def test_log_discovery(self, tmp_context_dir):
        agent_context.disable_insforge_sync()
        agent_context.write_md("discoveries.md", "# Discoveries\n\n")
        agent_context.log_discovery(1, "youtube", "saas tools", "Found a tool", "https://example.com")
        content = agent_context.read_md("discoveries.md")
        assert "saas tools" in content
        assert "https://example.com" in content

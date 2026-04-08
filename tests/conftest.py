"""Shared fixtures for MasterBuild Python tests."""

from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture()
def tmp_context_dir(monkeypatch):
    """Create a temporary context directory and patch agent_context to use it."""
    tmpdir = tempfile.mkdtemp(prefix="masterbuild_test_")
    import agent_context
    monkeypatch.setattr(agent_context, "CONTEXT_DIR", Path(tmpdir))
    yield Path(tmpdir)
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture()
def mock_insforge_client():
    """Return a mock InsForge client with standard async methods."""
    client = MagicMock()
    client.list_records = AsyncMock(return_value=[])
    client.insert_records = AsyncMock(return_value=None)
    client.update_records = AsyncMock(return_value=None)
    client.append_log = AsyncMock(return_value=None)
    client.append_signal = AsyncMock(return_value=None)
    client.append_thought = AsyncMock(return_value=None)
    client.append_business_plan = AsyncMock(return_value=None)
    client.get_recent_discoveries = AsyncMock(return_value=[])
    return client


@pytest.fixture()
def mock_ai():
    """Return a mock MasterBuildAI that returns predictable JSON."""
    ai = MagicMock()
    ai.model = "test-model"
    ai._insforge_client = None
    ai._mission_id = None
    ai.enable_thought_logging = MagicMock()
    ai.generate_chat_completion = AsyncMock(return_value='{"test": true}')
    ai.synthesize_business_plan = AsyncMock(return_value={
        "market_opportunity": "Test market",
        "competitive_landscape": "Test competition",
        "revenue_models": "SaaS subscription",
        "user_acquisition": "Content marketing",
        "risk_analysis": "Low risk",
        "confidence_score": 55,
        "executive_summary": "A test business plan",
        "recommended_next_steps": ["Step 1", "Step 2"],
    })
    return ai

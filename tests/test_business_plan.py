"""Tests for business plan synthesis in MasterBuildAI and orchestrator."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest


class TestSynthesizeBusinessPlan:
    """Test MasterBuildAI.synthesize_business_plan method."""

    @pytest.mark.asyncio
    async def test_synthesize_returns_structured_plan(self):
        """synthesize_business_plan should return a dict with all required keys."""
        # We can't import MasterBuildAI directly because it requires openai,
        # but we can test the logic by mocking
        from masterbuild_runtime import MasterBuildAI, extract_json_block

        ai = MasterBuildAI.__new__(MasterBuildAI)
        ai.model = "test-model"
        ai._client = None
        ai._insforge_client = None
        ai._mission_id = None

        plan_response = json.dumps({
            "market_opportunity": "Large TAM for PM tools",
            "competitive_landscape": "Asana, Monday.com dominate",
            "revenue_models": "SaaS subscription",
            "user_acquisition": "Content marketing + SEO",
            "risk_analysis": "Commoditized market",
            "confidence_score": 62,
            "executive_summary": "A niche PM tool for agencies",
            "recommended_next_steps": ["Build MVP", "Launch beta"],
        })

        ai.generate_chat_completion = AsyncMock(return_value=plan_response)

        discoveries = [
            {"platform": "reddit", "keywords": "pm tools", "summary": "People want simpler tools", "source_url": "https://reddit.com/r/pm"},
            {"platform": "youtube", "keywords": "project management", "summary": "Viral video on PM hacks", "source_url": "https://youtube.com/watch?v=123"},
        ]

        result = await ai.synthesize_business_plan(
            "Build a PM tool for small agencies",
            discoveries,
            "# Current Plan\nDraft...",
        )

        assert result["market_opportunity"] == "Large TAM for PM tools"
        assert result["confidence_score"] == 62
        assert "recommended_next_steps" in result
        assert len(result["recommended_next_steps"]) == 2

    @pytest.mark.asyncio
    async def test_synthesize_fallback_on_error(self):
        """synthesize_business_plan should return defaults when AI fails."""
        from masterbuild_runtime import MasterBuildAI

        ai = MasterBuildAI.__new__(MasterBuildAI)
        ai.model = "test-model"
        ai._client = None
        ai._insforge_client = None
        ai._mission_id = None

        ai.generate_chat_completion = AsyncMock(side_effect=Exception("API down"))

        result = await ai.synthesize_business_plan(
            "Test idea", [], "# Plan",
        )

        # Should get fallback values
        assert "Pending" in result["market_opportunity"]
        assert result["confidence_score"] >= 0


class TestExtractJsonBlock:
    """Test the extract_json_block utility."""

    def test_extracts_json_from_markdown(self):
        from masterbuild_runtime import extract_json_block

        text = '```json\n{"key": "value"}\n```'
        result = extract_json_block(text)
        assert result == {"key": "value"}

    def test_extracts_bare_json(self):
        from masterbuild_runtime import extract_json_block

        text = '{"options": [1, 2, 3]}'
        result = extract_json_block(text)
        assert result == {"options": [1, 2, 3]}

    def test_extracts_json_array(self):
        from masterbuild_runtime import extract_json_block

        text = '["term1", "term2"]'
        result = extract_json_block(text)
        assert result == ["term1", "term2"]

    def test_raises_on_invalid(self):
        from masterbuild_runtime import extract_json_block

        with pytest.raises(ValueError, match="could not parse JSON"):
            extract_json_block("not json at all")

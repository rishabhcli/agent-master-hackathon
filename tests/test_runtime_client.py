from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from masterbuild_runtime import InsForgeRuntimeClient


@pytest.fixture()
def runtime_client(monkeypatch: pytest.MonkeyPatch) -> InsForgeRuntimeClient:
    monkeypatch.setenv("MASTERBUILD_INSFORGE_URL", "https://example.insforge.app")
    monkeypatch.setenv("MASTERBUILD_INSFORGE_TOKEN", "test-token")
    client = InsForgeRuntimeClient()
    return client


@pytest.mark.asyncio
async def test_get_agents_scopes_to_mission_when_provided(runtime_client: InsForgeRuntimeClient) -> None:
    runtime_client.list_records = AsyncMock(return_value=[])

    await runtime_client.get_agents("mission-123")

    runtime_client.list_records.assert_awaited_once_with(
        "agents",
        params={"order": "agent_id.asc", "limit": 5, "mission_id": "eq.mission-123"},
        retry_on_429=False,
    )


@pytest.mark.asyncio
async def test_get_recent_discoveries_scopes_to_mission_when_provided(runtime_client: InsForgeRuntimeClient) -> None:
    runtime_client.list_records = AsyncMock(return_value=[])

    await runtime_client.get_recent_discoveries(24, mission_id="mission-123")

    runtime_client.list_records.assert_awaited_once_with(
        "discoveries",
        params={"order": "created_at.desc", "limit": 24, "mission_id": "eq.mission-123"},
        retry_on_429=False,
    )


@pytest.mark.asyncio
async def test_get_pending_commands_scopes_to_mission_when_provided(runtime_client: InsForgeRuntimeClient) -> None:
    runtime_client.list_records = AsyncMock(return_value=[])

    await runtime_client.get_pending_commands(mission_id="mission-123")

    runtime_client.list_records.assert_awaited_once_with(
        "control_commands",
        params={
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": 25,
            "mission_id": "eq.mission-123",
        },
        retry_on_429=False,
    )


@pytest.mark.asyncio
async def test_update_agent_filters_by_mission_when_provided(runtime_client: InsForgeRuntimeClient) -> None:
    runtime_client.update_records = AsyncMock(return_value=[])

    await runtime_client.update_agent(3, mission_id="mission-123", status="searching")

    runtime_client.update_records.assert_awaited_once()
    args = runtime_client.update_records.await_args
    assert args.args[0] == "agents"
    assert args.kwargs["filters"] == {"agent_id": "eq.3", "mission_id": "eq.mission-123"}
    assert args.kwargs["values"]["status"] == "searching"
    assert "updated_at" in args.kwargs["values"]
    assert args.kwargs["retry_on_429"] is False

from __future__ import annotations

import asyncio
import json
import os
import random
import shutil
import signal
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, quote_plus

import httpx
from browser_use import BrowserSession
from dotenv import load_dotenv
from openai import AsyncOpenAI

from livestream_tiktok import build_local_browser_session

load_dotenv()


@dataclass(frozen=True)
class AgentSpec:
    agent_id: int
    name: str
    platform: str
    role: str


AGENT_SPECS: tuple[AgentSpec, ...] = (
    AgentSpec(1, "Vibe", "tiktok", "Discovery"),
    AgentSpec(2, "Pulse", "tiktok", "Collection"),
    AgentSpec(3, "Rhythm", "tiktok", "Analysis"),
    AgentSpec(4, "Echo", "youtube", "Discovery"),
    AgentSpec(5, "Nova", "youtube", "Collection"),
    AgentSpec(6, "Blaze", "youtube", "Analysis"),
    AgentSpec(7, "Cipher", "duckduckgo", "Discovery"),
    AgentSpec(8, "Nexus", "duckduckgo", "Collection"),
    AgentSpec(9, "Oracle", "duckduckgo", "Analysis"),
)


def utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def build_search_url(platform: str, query: str) -> str:
    encoded = quote_plus(query)
    if platform == "tiktok":
        return f"https://www.tiktok.com/search?q={encoded}"
    if platform == "youtube":
        return f"https://www.youtube.com/results?search_query={encoded}&sp=EgIYAQ%253D%253D"
    return f"https://duckduckgo.com/?q={encoded}&ia=web"


def extract_json_block(text: str) -> Any:
    text = text.strip()
    if not text:
        raise ValueError("empty AI response")

    for candidate in (text, text[text.find("[") : text.rfind("]") + 1], text[text.find("{") : text.rfind("}") + 1]):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise ValueError(f"could not parse JSON from AI response: {text}")


class InsForgeRuntimeClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("MASTERBUILD_INSFORGE_URL", "https://qnm7e5sc.us-west.insforge.app").rstrip("/")
        token = os.getenv("MASTERBUILD_INSFORGE_TOKEN") or os.getenv("NEXT_PUBLIC_INSFORGE_ANON_KEY", "")
        if not token:
            raise RuntimeError("Missing MASTERBUILD_INSFORGE_TOKEN or NEXT_PUBLIC_INSFORGE_ANON_KEY")
        self.preview_bucket = os.getenv("MASTERBUILD_PREVIEW_BUCKET", "agent-previews")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=45.0,
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        response = await self._client.request(method, path, **kwargs)
        response.raise_for_status()
        return response

    async def list_records(self, table: str, *, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        response = await self._request("GET", f"/api/database/records/{table}", params=params)
        data = response.json()
        return data if isinstance(data, list) else []

    async def insert_records(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        response = await self._request(
            "POST",
            f"/api/database/records/{table}",
            headers={"Prefer": "return=representation"},
            json=rows,
        )
        data = response.json()
        return data if isinstance(data, list) else []

    async def update_records(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        response = await self._request(
            "PATCH",
            f"/api/database/records/{table}",
            params=filters,
            headers={"Prefer": "return=representation"},
            json=values,
        )
        data = response.json()
        return data if isinstance(data, list) else []

    async def rpc(self, function_name: str, payload: dict[str, Any] | None = None) -> Any:
        response = await self._request("POST", f"/api/database/rpc/{function_name}", json=payload or {})
        return response.json()

    async def get_latest_mission(self) -> dict[str, Any] | None:
        rows = await self.list_records("missions", params={"limit": 1, "order": "created_at.desc"})
        return rows[0] if rows else None

    async def get_agents(self) -> list[dict[str, Any]]:
        return await self.list_records("agents", params={"order": "agent_id.asc", "limit": 9})

    async def get_recent_discoveries(self, limit: int = 20) -> list[dict[str, Any]]:
        return await self.list_records("discoveries", params={"order": "created_at.desc", "limit": limit})

    async def get_pending_commands(self) -> list[dict[str, Any]]:
        return await self.list_records(
            "control_commands",
            params={"status": "eq.pending", "order": "created_at.asc", "limit": 25},
        )

    async def mark_command_handled(self, command_id: str) -> None:
        await self.update_records(
            "control_commands",
            filters={"id": f"eq.{command_id}"},
            values={"status": "handled", "handled_at": utc_now()},
        )

    async def update_mission(self, mission_id: str, **values: Any) -> None:
        await self.update_records("missions", filters={"id": f"eq.{mission_id}"}, values=values)

    async def update_agent(self, agent_id: int, **values: Any) -> None:
        values.setdefault("updated_at", utc_now())
        await self.update_records("agents", filters={"agent_id": f"eq.{agent_id}"}, values=values)

    async def append_log(self, mission_id: str, *, agent_id: int | None, log_type: str, message: str, metadata: dict[str, Any] | None = None) -> None:
        await self.insert_records(
            "logs",
            [
                {
                    "mission_id": mission_id,
                    "agent_id": agent_id,
                    "type": log_type,
                    "message": message,
                    "metadata": metadata or {},
                    "created_at": utc_now(),
                }
            ],
        )

    async def append_signal(self, mission_id: str, *, from_agent: int, to_agent: int, signal_type: str, message: str, payload: dict[str, Any] | None = None) -> None:
        await self.insert_records(
            "signals",
            [
                {
                    "mission_id": mission_id,
                    "from_agent": from_agent,
                    "to_agent": to_agent,
                    "signal_type": signal_type,
                    "message": message,
                    "payload": payload or {},
                    "created_at": utc_now(),
                }
            ],
        )

    async def append_discovery(
        self,
        mission_id: str,
        *,
        agent_id: int,
        platform: str,
        source_url: str,
        thumbnail_url: str,
        keywords: str,
        summary: str,
    ) -> None:
        await self.insert_records(
            "discoveries",
            [
                {
                    "mission_id": mission_id,
                    "agent_id": agent_id,
                    "platform": platform,
                    "title": keywords,
                    "source_url": source_url,
                    "thumbnail_url": thumbnail_url,
                    "keywords": keywords,
                    "summary": summary,
                    "likes": 0,
                    "views": 0,
                    "comments": 0,
                    "created_at": utc_now(),
                }
            ],
        )

    async def upload_preview_frame(self, agent_id: int, screenshot_path: str) -> dict[str, Any]:
        screenshot_file = Path(screenshot_path)
        strategy = await self._request(
            "POST",
            f"/api/storage/buckets/{self.preview_bucket}/upload-strategy",
            json={
                "filename": screenshot_file.name,
                "contentType": "image/jpeg",
                "size": screenshot_file.stat().st_size,
            },
        )
        strategy_payload = strategy.json()
        if not isinstance(strategy_payload, dict):
            raise RuntimeError("Invalid preview upload strategy from InsForge storage.")

        upload_url = str(strategy_payload.get("uploadUrl", "")).strip()
        object_key = str(strategy_payload.get("key", "")).strip()
        method = str(strategy_payload.get("method", "")).strip()
        if not upload_url or not object_key or method not in {"direct", "presigned"}:
            raise RuntimeError("InsForge storage upload strategy is incomplete.")

        with open(screenshot_path, "rb") as file_handle:
            if method == "direct":
                response = await self._client.put(
                    upload_url,
                    files={"file": (screenshot_file.name, file_handle, "image/jpeg")},
                )
            else:
                fields = strategy_payload.get("fields", {})
                multipart_fields = {}
                if isinstance(fields, dict):
                    multipart_fields.update({str(key): str(value) for key, value in fields.items()})
                multipart_fields["file"] = (screenshot_file.name, file_handle, "image/jpeg")
                async with httpx.AsyncClient(timeout=45.0) as upload_client:
                    response = await upload_client.post(upload_url, files=multipart_fields)

        response.raise_for_status()

        if strategy_payload.get("confirmRequired"):
            confirm_url = str(strategy_payload.get("confirmUrl", "")).strip()
            if not confirm_url:
                raise RuntimeError("InsForge storage confirm URL missing for preview upload.")
            confirm_response = await self._request(
                "POST",
                confirm_url,
                json={
                    "size": screenshot_file.stat().st_size,
                    "contentType": "image/jpeg",
                },
            )
            payload = confirm_response.json()
        else:
            payload = {
                "bucket": self.preview_bucket,
                "key": object_key,
            }

        if not isinstance(payload, dict):
            raise RuntimeError("Invalid preview upload response from InsForge storage.")
        payload.setdefault("bucket", self.preview_bucket)
        payload.setdefault("key", object_key)
        return payload

    async def delete_storage_object(self, bucket: str, object_key: str) -> None:
        encoded_key = quote(object_key, safe="")
        response = await self._client.delete(f"/api/storage/buckets/{bucket}/objects/{encoded_key}")
        if response.status_code not in {200, 204, 404}:
            response.raise_for_status()


class PreviewManager:
    def __init__(self) -> None:
        self.runtime_dir = Path(os.getenv("MASTERBUILD_RUNTIME_DIR", Path.cwd() / "runtime")).expanduser()

    def _agent_dir(self, agent_id: int) -> Path:
        return self.runtime_dir / "previews" / f"agent-{agent_id}"

    async def publish(self, agent_id: int, *, status: str, title: str, current_url: str, note: str, screenshot_path: str | None) -> None:
        agent_dir = self._agent_dir(agent_id)
        agent_dir.mkdir(parents=True, exist_ok=True)

        if screenshot_path:
            target = agent_dir / "latest.jpg"
            shutil.copyfile(screenshot_path, target)

        metadata = {
            "agentId": agent_id,
            "status": status,
            "title": title,
            "currentUrl": current_url,
            "updatedAt": utc_now(),
            "heartbeatAt": utc_now(),
            "note": note,
        }
        (agent_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


class MasterBuildAI:
    def __init__(self) -> None:
        self.model = os.getenv("MASTERBUILD_AI_MODEL", "MiniMax-M2.7")
        self.base_url = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
        self.api_key = os.getenv("MINIMAX_API_KEY", "").strip()
        self._client = (
            AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )
            if self.api_key
            else None
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()

    async def generate_chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        if self._client is None:
            raise RuntimeError("Missing MINIMAX_API_KEY")

        response = await self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_completion_tokens=600,
        )
        return (response.choices[0].message.content or "").strip()

    async def generate_terms(self, prompt: str, platform: str, count: int = 3) -> list[str]:
        system_prompt = (
            "You create search terms for content discovery. "
            "Return only a JSON array of short search phrases."
        )
        user_prompt = (
            f"Mission: {prompt}\n"
            f"Platform: {platform}\n"
            f"Return exactly {count} search phrases tuned for this platform."
        )

        try:
            parsed = extract_json_block(await self.generate_chat_completion(system_prompt, user_prompt))
            if isinstance(parsed, list):
                cleaned = [str(item).strip() for item in parsed if str(item).strip()]
                if cleaned:
                    return cleaned[:count]
        except Exception:
            pass

        return [f"{prompt} {platform} trend", f"{prompt} best {platform}", f"{prompt} examples"][:count]

    async def summarize_discovery(self, prompt: str, query: str, title: str, url: str) -> tuple[str, str]:
        system_prompt = (
            "You summarize content-discovery findings. "
            "Return only JSON with keys keywords and summary."
        )
        user_prompt = (
            f"Mission: {prompt}\n"
            f"Query: {query}\n"
            f"Page title: {title}\n"
            f"URL: {url}\n"
            "Produce compact discovery keywords and a one-sentence summary."
        )

        try:
            parsed = extract_json_block(await self.generate_chat_completion(system_prompt, user_prompt))
            if isinstance(parsed, dict):
                keywords = str(parsed.get("keywords", query)).strip() or query
                summary = str(parsed.get("summary", title)).strip() or title or query
                return keywords, summary
        except Exception:
            pass

        return query, title or query


class MasterBuildOrchestrator:
    def __init__(self) -> None:
        self.client = InsForgeRuntimeClient()
        self.preview_manager = PreviewManager()
        self.ai = MasterBuildAI()
        self.stop_event = asyncio.Event()
        self.blackboard = deque(maxlen=24)
        self.headless = os.getenv("MASTERBUILD_HEADLESS", "false").lower() == "true"
        self.agent_cycle_delay = float(os.getenv("MASTERBUILD_AGENT_CYCLE_DELAY", "8"))
        self.navigation_wait = float(os.getenv("MASTERBUILD_NAVIGATION_WAIT", "5"))

    async def close(self) -> None:
        await self.ai.close()
        await self.client.close()

    async def watch_forever(self) -> None:
        while True:
            mission = await self.client.get_latest_mission()
            if mission and mission.get("status") in {"queued", "active"}:
                await self.run_mission(mission)
            await asyncio.sleep(3)

    async def run_mission(self, mission: dict[str, Any]) -> None:
        mission_id = str(mission["id"])
        prompt = str(mission.get("prompt", ""))
        self.stop_event.clear()
        self.blackboard.clear()

        await self.client.update_mission(mission_id, status="active", started_at=utc_now())
        await self.client.append_log(mission_id, agent_id=None, log_type="status", message="Mission activated.", metadata={})

        platform_terms = {
            "tiktok": await self.ai.generate_terms(prompt, "TikTok", 3),
            "youtube": await self.ai.generate_terms(prompt, "YouTube Shorts", 3),
            "duckduckgo": await self.ai.generate_terms(prompt, "DuckDuckGo web search", 3),
        }

        tasks = [
            asyncio.create_task(self.run_agent(spec, mission_id=mission_id, mission_prompt=prompt, initial_query=platform_terms[spec.platform][index % 3]))
            for index, spec in enumerate(AGENT_SPECS)
        ]
        control_task = asyncio.create_task(self.monitor_control_commands(mission_id))

        try:
            await asyncio.wait(tasks + [control_task], return_when=asyncio.FIRST_COMPLETED)
        finally:
            self.stop_event.set()
            for task in tasks + [control_task]:
                task.cancel()
            await asyncio.gather(*tasks, control_task, return_exceptions=True)
            await self.client.update_mission(mission_id, status="stopped", stopped_at=utc_now())
            await self.client.append_log(mission_id, agent_id=None, log_type="status", message="Mission halted.", metadata={})

    async def monitor_control_commands(self, mission_id: str) -> None:
        while not self.stop_event.is_set():
            commands = await self.client.get_pending_commands()
            for command in commands:
                command_name = str(command.get("command", ""))
                if command_name == "stop_all":
                    await self.client.update_mission(mission_id, status="stopping")
                    await self.client.append_log(mission_id, agent_id=None, log_type="status", message="Stop command received.", metadata={})
                    self.stop_event.set()
                await self.client.mark_command_handled(str(command["id"]))
            await asyncio.sleep(2)

    async def run_agent(self, spec: AgentSpec, *, mission_id: str, mission_prompt: str, initial_query: str) -> None:
        energy = 100
        active_query = initial_query
        seen_urls: set[str] = set()
        last_preview_key: str | None = None
        browser: BrowserSession | None = None

        try:
            browser = build_local_browser_session(spec.agent_id, spec.platform, headless=self.headless)
            await browser.start()

            while not self.stop_event.is_set():
                search_url = build_search_url(spec.platform, active_query)
                await self.client.update_agent(
                    spec.agent_id,
                    mission_id=mission_id,
                    status="searching",
                    current_url=search_url,
                    assignment=active_query,
                    energy=energy,
                    last_heartbeat=utc_now(),
                )
                await self.client.append_log(
                    mission_id,
                    agent_id=spec.agent_id,
                    log_type="search",
                    message=f"Searching {spec.platform} for {active_query}",
                    metadata={"query": active_query},
                )

                await browser.event_bus.dispatch_and_await(
                    browser.event_bus.events.NavigateToUrlEvent(url=search_url, new_tab=False)
                )
                await asyncio.sleep(self.navigation_wait)

                state = await browser.get_state()
                screenshot_path = await browser.get_screenshot()
                page_url = str(getattr(state, "url", search_url) or search_url)
                page_title = str(getattr(state, "title", active_query) or active_query)
                preview_upload: dict[str, Any] | None = None

                await self.preview_manager.publish(
                    spec.agent_id,
                    status="searching",
                    title=page_title,
                    current_url=page_url,
                    note=active_query,
                    screenshot_path=screenshot_path,
                )
                preview_updated_at: str | None = None
                if screenshot_path:
                    try:
                        preview_upload = await self.client.upload_preview_frame(spec.agent_id, screenshot_path)
                        uploaded_key = str(preview_upload.get("key", "")).strip()
                        uploaded_bucket = str(preview_upload.get("bucket", self.client.preview_bucket)).strip() or self.client.preview_bucket
                        if last_preview_key and last_preview_key != uploaded_key:
                            await self.client.delete_storage_object(uploaded_bucket, last_preview_key)
                        last_preview_key = uploaded_key or None
                        preview_updated_at = utc_now() if uploaded_key else None
                    except Exception as preview_error:
                        preview_upload = (
                            {
                                "bucket": self.client.preview_bucket,
                                "key": last_preview_key,
                            }
                            if last_preview_key
                            else None
                        )
                        await self.client.append_log(
                            mission_id,
                            agent_id=spec.agent_id,
                            log_type="status",
                            message=f"Preview relay degraded: {preview_error}",
                            metadata={"query": active_query},
                        )

                keywords, summary = await self.ai.summarize_discovery(mission_prompt, active_query, page_title, page_url)
                if page_url not in seen_urls:
                    seen_urls.add(page_url)
                    self.blackboard.appendleft(keywords)
                    await self.client.append_discovery(
                        mission_id,
                        agent_id=spec.agent_id,
                        platform=spec.platform,
                        source_url=page_url,
                        thumbnail_url=f"/api/agent-stream/{spec.agent_id}/frame",
                        keywords=keywords,
                        summary=summary,
                    )
                    await self.client.append_log(
                        mission_id,
                        agent_id=spec.agent_id,
                        log_type="discovery",
                        message=f"Captured discovery: {keywords}",
                        metadata={"url": page_url},
                    )
                    await self.client.append_signal(
                        mission_id,
                        from_agent=spec.agent_id,
                        to_agent=(spec.agent_id % 9) + 1,
                        signal_type="blackboard_share",
                        message=keywords,
                        payload={"query": active_query},
                    )

                energy = 100
                await self.client.update_agent(
                    spec.agent_id,
                    status="found_trend",
                    current_url=page_url,
                    energy=energy,
                    last_discovery_keywords=[keywords],
                    preview_bucket=(preview_upload or {}).get("bucket"),
                    preview_key=(preview_upload or {}).get("key"),
                    preview_updated_at=preview_updated_at,
                    last_heartbeat=utc_now(),
                )
                await self.preview_manager.publish(
                    spec.agent_id,
                    status="found_trend",
                    title=page_title,
                    current_url=page_url,
                    note=keywords,
                    screenshot_path=screenshot_path,
                )

                active_query = self.choose_next_query(spec.platform, mission_prompt, fallback=active_query)
                await asyncio.sleep(self.agent_cycle_delay)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            energy = max(0, energy - 30)
            next_query = self.choose_next_query(spec.platform, mission_prompt, fallback=active_query)
            await self.client.update_agent(
                spec.agent_id,
                status="weak" if energy <= 40 else "error",
                energy=energy,
                assignment=next_query,
                last_heartbeat=utc_now(),
            )
            await self.client.append_log(
                mission_id,
                agent_id=spec.agent_id,
                log_type="error",
                message=str(error),
                metadata={"query": active_query},
            )
            if energy <= 40:
                await self.client.append_signal(
                    mission_id,
                    from_agent=(spec.agent_id % 9) + 1,
                    to_agent=spec.agent_id,
                    signal_type="reassignment",
                    message=next_query,
                    payload={"reason": "low_energy"},
                )
        finally:
            if browser is not None:
                await browser.kill()
            if last_preview_key:
                await self.client.delete_storage_object(self.client.preview_bucket, last_preview_key)
            await self.client.update_agent(
                spec.agent_id,
                status="stopped",
                session_id=None,
                preview_bucket=None,
                preview_key=None,
                preview_updated_at=None,
                last_heartbeat=utc_now(),
            )

    def choose_next_query(self, platform: str, mission_prompt: str, *, fallback: str) -> str:
        while self.blackboard:
            candidate = self.blackboard[0]
            if candidate:
                return f"{candidate} {platform}"
        return fallback or f"{mission_prompt} {platform}"


async def run_masterbuild() -> None:
    orchestrator = MasterBuildOrchestrator()
    stop = asyncio.Event()

    def handle_stop(*_: Any) -> None:
        stop.set()
        orchestrator.stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_stop)

    try:
        watcher = asyncio.create_task(orchestrator.watch_forever())
        await stop.wait()
        watcher.cancel()
        await asyncio.gather(watcher, return_exceptions=True)
    finally:
        await orchestrator.close()

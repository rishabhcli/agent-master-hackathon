from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import re

import httpx
from browser_use import Agent, BrowserSession
from builder_agent import BuilderAgent
from dotenv import load_dotenv
from openai import AsyncOpenAI

import agent_context
from livestream_tiktok import build_local_browser_session

load_dotenv()
load_dotenv(".env.local", override=True)


@dataclass(frozen=True)
class AgentSpec:
    agent_id: int
    name: str
    platform: str
    role: str


AGENT_SPECS: tuple[AgentSpec, ...] = (
    AgentSpec(1, "Echo", "youtube", "Video Scan"),
    AgentSpec(2, "Pulse", "x", "Conversation Scan"),
    AgentSpec(3, "Thread", "reddit", "Community Scan"),
    AgentSpec(4, "Ledger", "substack", "Narrative Scan"),
    AgentSpec(5, "Atlas", "market_research", "Market Research"),
)
MAX_AGENT_ID = len(AGENT_SPECS)
BROWSING_PLATFORMS = tuple(spec.platform for spec in AGENT_SPECS if spec.platform != "market_research")
PLATFORM_DOMAINS: dict[str, tuple[str, ...]] = {
    "youtube": ("youtube.com", "youtu.be"),
    "x": ("x.com",),
    "reddit": ("reddit.com",),
    "substack": ("substack.com",),
}
LOVABLE_REQUIRED_PLATFORMS: tuple[str, ...] = ("youtube", "x", "reddit", "substack")
LOVABLE_PROMPT_MAX_CHARS = 3500
GENERIC_DISCOVERY_SUMMARIES = {
    "",
    "youtube.com",
    "x.com",
    "reddit",
    "reddit.com",
    "substack",
    "substack.com",
}


def is_valid_platform_content_url(platform: str, url: str) -> bool:
    if not url:
        return False

    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "/").rstrip("/") or "/"

    if not host:
        return False

    if platform == "youtube":
        if "youtube.com" in host:
            return path == "/watch" or path.startswith("/shorts/") or path.startswith("/post/")
        if "youtu.be" in host:
            return path not in {"", "/"}
        return False

    if platform == "x":
        if "x.com" not in host:
            return False
        return "/status/" in path

    if platform == "reddit":
        if "reddit.com" not in host:
            return False
        return "/comments/" in path

    if platform == "substack":
        if "substack.com" not in host:
            return False
        if host.endswith(".substack.com"):
            blocked_paths = {"/", "/search", "/archive", "/publish"}
            return path not in blocked_paths and not path.startswith("/search") and not path.startswith("/publish")
        return path.startswith("/p/")

    return False


def normalize_discovery_record(record: dict[str, Any]) -> dict[str, str]:
    return {
        "id": str(record.get("id", "")).strip(),
        "platform": str(record.get("platform", "")).strip(),
        "title": str(record.get("title", "")).strip(),
        "keywords": str(record.get("keywords", "")).strip(),
        "summary": str(record.get("summary", "")).strip(),
        "source_url": str(record.get("source_url", record.get("url", ""))).strip(),
    }


def is_valid_discovery_record(record: dict[str, Any]) -> bool:
    normalized = normalize_discovery_record(record)
    platform = normalized["platform"]
    url = normalized["source_url"]
    summary = normalized["summary"].lower()
    title = normalized["title"].lower()
    if summary in GENERIC_DISCOVERY_SUMMARIES or title in GENERIC_DISCOVERY_SUMMARIES:
        return False
    return bool(platform and summary and is_valid_platform_content_url(platform, url))


def filter_valid_discoveries(discoveries: list[dict[str, Any]]) -> list[dict[str, str]]:
    vetted: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for record in discoveries:
        if not is_valid_discovery_record(record):
            continue
        normalized = normalize_discovery_record(record)
        if normalized["source_url"] in seen_urls:
            continue
        seen_urls.add(normalized["source_url"])
        vetted.append(normalized)
    return vetted


def discovery_to_evidence(record: dict[str, Any]) -> dict[str, str]:
    normalized = normalize_discovery_record(record)
    return {
        "id": normalized["id"],
        "platform": normalized["platform"],
        "title": normalized["title"],
        "keywords": normalized["keywords"],
        "summary": normalized["summary"],
        "url": normalized["source_url"],
    }


def build_platform_coverage(discoveries: list[dict[str, Any]]) -> dict[str, Any]:
    completed = sorted(
        {
            str(item.get("platform", "")).strip()
            for item in discoveries
            if is_valid_discovery_record(item)
        }
        & set(LOVABLE_REQUIRED_PLATFORMS)
    )
    missing = [platform for platform in LOVABLE_REQUIRED_PLATFORMS if platform not in completed]
    return {
        "requiredPlatforms": list(LOVABLE_REQUIRED_PLATFORMS),
        "completedPlatforms": completed,
        "missingPlatforms": missing,
        "readyForLovable": not missing,
    }


def build_lovable_launch_url(prompt: str) -> str:
    compact_prompt = " ".join((prompt or "").split())[:LOVABLE_PROMPT_MAX_CHARS].strip()
    return f"https://lovable.dev/?autosubmit=true#prompt={quote(compact_prompt, safe='')}" if compact_prompt else ""


def _clean_string_list(value: Any, *, limit: int = 8) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def _normalize_plan_items(
    value: Any,
    *,
    keys: tuple[str, ...],
    list_keys: tuple[str, ...] = (),
    limit: int = 6,
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for raw_item in value[:limit]:
        if not isinstance(raw_item, dict):
            continue
        normalized: dict[str, Any] = {}
        for key in keys:
            field = raw_item.get(key)
            if key in list_keys:
                values = field if isinstance(field, list) else [field]
                normalized[key] = _clean_string_list(values, limit=6)
            elif isinstance(field, list):
                normalized[key] = _clean_string_list(field, limit=6)
            else:
                normalized[key] = str(field or "").strip()
        if any(normalized.values()):
            items.append(normalized)
    return items


def _dedupe_evidence_items(items: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for item in items:
        url = str(item.get("url", "")).strip()
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        deduped.append(item)
    return deduped


def select_primary_option(options: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not options:
        return None

    def score(option: dict[str, Any]) -> tuple[int, int, int, str]:
        evidence = option.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []
        platforms = {str(item.get("platform", "")).strip() for item in evidence if str(item.get("platform", "")).strip()}
        concept = str(option.get("concept", "")).strip()
        return (len(platforms), len(evidence), len(concept), str(option.get("id", "")))

    return max(options, key=score)


def build_plan_source_evidence(
    primary_option: dict[str, Any] | None,
    discoveries: list[dict[str, Any]],
    completed_platforms: list[str],
) -> list[dict[str, str]]:
    evidence: list[dict[str, str]] = []
    if primary_option and isinstance(primary_option.get("evidence"), list):
        for item in primary_option["evidence"]:
            evidence.append(
                {
                    "id": str(item.get("id", "")).strip(),
                    "platform": str(item.get("platform", "")).strip(),
                    "title": str(item.get("title", "")).strip(),
                    "keywords": str(item.get("keywords", "")).strip(),
                    "summary": str(item.get("summary", "")).strip(),
                    "url": str(item.get("url", "")).strip(),
                }
            )

    discoveries_by_platform: dict[str, list[dict[str, Any]]] = {platform: [] for platform in completed_platforms}
    for discovery in discoveries:
        platform = str(discovery.get("platform", "")).strip()
        if platform in discoveries_by_platform:
            discoveries_by_platform[platform].append(discovery)

    present_platforms = {str(item.get("platform", "")).strip() for item in evidence}
    for platform in completed_platforms:
        if platform in present_platforms:
            continue
        candidates = discoveries_by_platform.get(platform, [])
        if candidates:
            evidence.append(discovery_to_evidence(candidates[0]))

    return _dedupe_evidence_items(evidence)


def build_lovable_prompt_from_plan(plan: dict[str, Any]) -> str:
    title = str(plan.get("title", "Validated MVP")).strip()
    one_liner = str(plan.get("oneLiner", "")).strip()
    target_users = str(plan.get("targetUsers", "")).strip()
    value_prop = str(plan.get("valueProp", "")).strip()
    flows = _clean_string_list(plan.get("coreUserFlows"), limit=4)
    screens = [
        str(screen.get("name", "")).strip()
        for screen in plan.get("screens", [])[:5]
        if isinstance(screen, dict) and str(screen.get("name", "")).strip()
    ]
    entities = [
        str(entity.get("entity", "")).strip()
        for entity in plan.get("dataModel", [])[:5]
        if isinstance(entity, dict) and str(entity.get("entity", "")).strip()
    ]
    monetization = str(plan.get("monetization", "")).strip()

    parts = [
        f"Build an MVP web app called {title}.",
        one_liner,
        f"Target users: {target_users}." if target_users else "",
        f"Value proposition: {value_prop}." if value_prop else "",
        f"Primary user flows: {', '.join(flows)}." if flows else "",
        f"Required screens: {', '.join(screens)}." if screens else "",
        f"Key data entities: {', '.join(entities)}." if entities else "",
        f"Monetization: {monetization}." if monetization else "",
        "Keep scope MVP-only and make the product immediately usable.",
    ]
    return " ".join(part for part in parts if part).strip()


def utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?```", re.DOTALL)


def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> blocks and markdown code fences that MiniMax M2.7 emits."""
    text = _THINK_RE.sub("", text).strip()
    # Also strip ```json ... ``` code fences
    m = _CODE_FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    return text


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


class BraveSearchClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
        self.base_url = os.getenv(
            "BRAVE_SEARCH_API_URL",
            "https://api.search.brave.com/res/v1/web/search",
        ).rstrip("/")
        self._last_request_at = 0.0
        self._client = (
            httpx.AsyncClient(
                timeout=20.0,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": self.api_key,
                },
            )
            if self.api_key
            else None
        )

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()

    def _build_query(self, platform: str, query: str) -> str:
        if platform == "youtube":
            return f"site:youtube.com/shorts {query}"
        if platform == "x":
            return f"site:x.com {query}"
        if platform == "reddit":
            return f"site:reddit.com {query}"
        if platform == "substack":
            return f"site:substack.com {query}"
        return query

    def _matches_platform(self, platform: str, url: str) -> bool:
        lowered_url = url.lower()
        return any(domain in lowered_url for domain in PLATFORM_DOMAINS.get(platform, ()))

    async def search(self, query: str, *, count: int = 6) -> list[dict[str, str]]:
        if self._client is None:
            return []

        now = asyncio.get_running_loop().time()
        wait_time = 1.1 - (now - self._last_request_at)
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        response = await self._client.get(
            self.base_url,
            params={
                "q": query,
                "count": count,
                "extra_snippets": "true",
                "text_decorations": "false",
            },
        )
        self._last_request_at = asyncio.get_running_loop().time()
        response.raise_for_status()

        payload = response.json()
        web_results = payload.get("web", {}).get("results", []) if isinstance(payload, dict) else []
        curated_results: list[dict[str, str]] = []
        for item in web_results:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url", "")).strip()
            if not url:
                continue
            curated_results.append(
                {
                    "url": url,
                    "title": str(item.get("title", "")).strip(),
                    "description": str(item.get("description", "")).strip(),
                }
            )
        return curated_results

    async def curate_links(self, platform: str, queries: list[str], *, max_results: int = 6) -> list[dict[str, str]]:
        curated: list[dict[str, str]] = []
        seen_urls: set[str] = set()
        for query in queries:
            brave_query = self._build_query(platform, query)
            try:
                results = await self.search(brave_query, count=max_results)
            except Exception as error:
                print(f"[brave] search failed for {platform}: {error}")
                continue

            for result in results:
                url = result["url"]
                normalized = url.rstrip("/")
                if normalized in seen_urls or not self._matches_platform(platform, url):
                    continue
                seen_urls.add(normalized)
                curated.append(
                    {
                        "query": query,
                        "url": url,
                        "title": result["title"],
                        "description": result["description"],
                    }
                )
                if len(curated) >= max_results:
                    return curated
        return curated


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
        for attempt in range(3):
            response = await self._client.request(method, path, **kwargs)
            if response.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"[insforge] rate limited on {path}, retrying in {wait}s")
                await asyncio.sleep(wait)
                continue
            response.raise_for_status()
            return response
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
        return await self.list_records("agents", params={"order": "agent_id.asc", "limit": MAX_AGENT_ID})

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

    async def execute_sql(self, sql: str) -> None:
        """Execute raw SQL on InsForge (for schema creation)."""
        try:
            await self._request("POST", "/api/database/sql", json={"query": sql})
        except Exception as e:
            print(f"[insforge] SQL execution error: {e}")
            raise

    async def get_all_discovered_urls(self, mission_id: str) -> set[str]:
        """Get all URLs already discovered by ANY agent in this mission (cross-agent dedup)."""
        try:
            records = await self.list_records(
                "discoveries",
                params={"mission_id": f"eq.{mission_id}", "select": "source_url", "limit": 500},
            )
            return {str(r.get("source_url", "")) for r in records if r.get("source_url")}
        except Exception:
            return set()

    async def append_discovery(
        self,
        mission_id: str,
        *,
        agent_id: int,
        platform: str,
        title: str,
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
                    "title": title,
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

    # ── Agent Thoughts (observability) ────────────────────────────────

    async def append_thought(
        self,
        mission_id: str,
        *,
        agent_id: int | None,
        thought_type: str = "inference",
        prompt_summary: str,
        response_summary: str,
        action_taken: str = "",
        model: str = "",
        tokens_used: int = 0,
        duration_ms: int = 0,
    ) -> None:
        try:
            await self.insert_records(
                "agent_thoughts",
                [{
                    "mission_id": mission_id,
                    "agent_id": agent_id,
                    "thought_type": thought_type,
                    "prompt_summary": prompt_summary[:500],
                    "response_summary": response_summary[:500],
                    "action_taken": action_taken[:200],
                    "model": model,
                    "tokens_used": tokens_used,
                    "duration_ms": duration_ms,
                    "created_at": utc_now(),
                }],
            )
        except Exception as e:
            print(f"[insforge] append_thought error: {e}")

    # ── Business Plans ────────────────────────────────────────────────

    async def append_business_plan(
        self,
        mission_id: str,
        *,
        version: int,
        market_opportunity: str = "",
        competitive_landscape: str = "",
        revenue_models: str = "",
        user_acquisition: str = "",
        risk_analysis: str = "",
        confidence_score: int = 0,
        discovery_count: int = 0,
        is_final: bool = False,
        raw_plan: str = "",
    ) -> None:
        try:
            await self.insert_records(
                "business_plans",
                [{
                    "mission_id": mission_id,
                    "version": version,
                    "market_opportunity": market_opportunity,
                    "competitive_landscape": competitive_landscape,
                    "revenue_models": revenue_models,
                    "user_acquisition": user_acquisition,
                    "risk_analysis": risk_analysis,
                    "confidence_score": confidence_score,
                    "discovery_count": discovery_count,
                    "is_final": is_final,
                    "raw_plan": raw_plan,
                    "created_at": utc_now(),
                }],
            )
        except Exception as e:
            print(f"[insforge] append_business_plan error: {e}")


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
        # Set by orchestrator to enable thought logging
        self._insforge_client: InsForgeRuntimeClient | None = None
        self._mission_id: str | None = None

    def enable_thought_logging(self, client: InsForgeRuntimeClient, mission_id: str) -> None:
        self._insforge_client = client
        self._mission_id = mission_id

    def _log_thought(
        self,
        *,
        agent_id: int | None = None,
        thought_type: str = "inference",
        prompt_summary: str,
        response_summary: str,
        action_taken: str = "",
        tokens_used: int = 0,
        duration_ms: int = 0,
    ) -> None:
        """Fire-and-forget thought logging to InsForge."""
        if self._insforge_client is None or self._mission_id is None:
            return
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._insforge_client.append_thought(
                self._mission_id,
                agent_id=agent_id,
                thought_type=thought_type,
                prompt_summary=prompt_summary,
                response_summary=response_summary,
                action_taken=action_taken,
                model=self.model,
                tokens_used=tokens_used,
                duration_ms=duration_ms,
            ))
        except RuntimeError:
            pass

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()

    async def generate_chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int = 600,
        thought_type: str = "inference",
        agent_id: int | None = None,
        action_label: str = "",
    ) -> str:
        if self._client is None:
            raise RuntimeError("Missing MINIMAX_API_KEY")

        import time
        t0 = time.monotonic()
        response = await self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_completion_tokens=max_tokens,
        )
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        result = strip_think_tags((response.choices[0].message.content or "").strip())
        tokens = getattr(response.usage, "total_tokens", 0) if response.usage else 0

        self._log_thought(
            agent_id=agent_id,
            thought_type=thought_type,
            prompt_summary=user_prompt[:300],
            response_summary=result[:300],
            action_taken=action_label,
            tokens_used=tokens,
            duration_ms=elapsed_ms,
        )
        return result

    async def generate_terms(self, prompt: str, platform: str, count: int = 3) -> list[str]:
        system_prompt = (
            "You create search terms for content discovery. "
            "Return only a JSON array of short search phrases. "
            "Do NOT include the platform name in the search terms."
        )
        user_prompt = (
            f"Mission: {prompt}\n"
            f"Platform: {platform}\n"
            f"Return exactly {count} search phrases tuned for this platform. "
            f"Do NOT include '{platform}' in the terms themselves."
        )

        try:
            parsed = extract_json_block(await self.generate_chat_completion(
                system_prompt, user_prompt,
                thought_type="planning", action_label=f"generate_terms:{platform}",
            ))
            if isinstance(parsed, list):
                cleaned = [str(item).strip() for item in parsed if str(item).strip()]
                if cleaned:
                    return cleaned[:count]
        except Exception:
            pass

        return [f"{prompt} trend", f"{prompt} best", f"{prompt} examples"][:count]

    async def generate_next_query(self, mission_prompt: str, platform: str, last_query: str, last_keywords: str, blackboard_hints: list[str]) -> str:
        system_prompt = (
            "You refine content-discovery search queries. "
            "Given what the agent just found, produce ONE better follow-up search phrase. "
            "Return only a plain text search phrase, no JSON, no quotes. "
            "Do NOT include the platform name in the search term."
        )
        hints_text = ", ".join(blackboard_hints[:5]) if blackboard_hints else "none yet"
        user_prompt = (
            f"Mission: {mission_prompt}\n"
            f"Platform: {platform}\n"
            f"Previous query: {last_query}\n"
            f"Keywords found: {last_keywords}\n"
            f"Other agents discovered: {hints_text}\n"
            "Produce one short, specific follow-up search phrase to dig deeper."
        )

        try:
            result = await self.generate_chat_completion(system_prompt, user_prompt)
            cleaned = result.strip().strip('"').strip("'").strip()
            if cleaned and len(cleaned) < 200:
                return cleaned
        except Exception:
            pass

        return last_keywords

    async def summarize_discovery(self, prompt: str, query: str, title: str, url: str, page_content: str = "") -> tuple[str, str]:
        system_prompt = (
            "You summarize content-discovery findings for a business research mission. "
            "Return only JSON with keys keywords and summary. "
            "Extract: engagement metrics, pain points, monetisation signals, audience size, viral patterns."
        )
        content_section = ""
        if page_content:
            trimmed = page_content[:2000].strip()
            content_section = f"\nPage content (excerpt):\n{trimmed}\n"
        user_prompt = (
            f"Mission: {prompt}\n"
            f"Query: {query}\n"
            f"Page title: {title}\n"
            f"URL: {url}\n"
            f"{content_section}\n"
            "Produce compact discovery keywords and a rich one-sentence business-insight summary."
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

    async def generate_market_research_report(
        self,
        original_prompt: str,
        discoveries: list[dict[str, str]],
    ) -> dict[str, Any]:
        system_prompt = (
            "You are a product strategist performing market research from social-platform inspiration. "
            "You will receive discovery records from browser sessions on YouTube, X, Reddit, and Substack. "
            "Return only JSON with keys market_research_summary, key_signals, and options. "
            "key_signals must be an array of short strings. "
            "options must be an array of exactly 3 objects. "
            "Each option object must contain title, concept, audience, why_promising, market_angle, recommended_format, and evidence_ids. "
            "evidence_ids must reference only the discovery IDs provided in the prompt."
        )
        discovery_lines = []
        for item in discoveries[:24]:
            discovery_lines.append(
                f"- [{item.get('id', '')}] {item.get('platform', '?')} | "
                f"{item.get('title', '')} | {item.get('keywords', '')} | "
                f"{item.get('summary', '')} | {item.get('source_url', '')}"
            )
        discoveries_text = "\n".join(discovery_lines) if discovery_lines else "(no discoveries yet)"
        user_prompt = (
            f"ORIGINAL IDEA:\n{original_prompt}\n\n"
            f"DISCOVERIES:\n{discoveries_text}\n\n"
            "Produce the market research summary and 3 concrete options."
        )

        try:
            parsed = extract_json_block(
                await self.generate_chat_completion(
                    system_prompt, user_prompt, max_tokens=1800,
                    thought_type="refinement", action_label="market_research_report",
                )
            )
            if isinstance(parsed, dict) and isinstance(parsed.get("options"), list):
                return parsed
        except Exception:
            pass

        fallback_options: list[dict[str, Any]] = []
        fallback_discoveries = discoveries[:3] or [
            {
                "id": "fallback-1",
                "platform": "web",
                "title": original_prompt,
                "keywords": original_prompt,
                "summary": "Fallback discovery",
                "source_url": "",
            }
        ]
        for index in range(3):
            discovery = fallback_discoveries[index % len(fallback_discoveries)]
            fallback_options.append(
                {
                    "title": f"Option {index + 1}",
                    "concept": discovery.get("summary") or original_prompt,
                    "audience": "Teams looking for validated content angles",
                    "why_promising": discovery.get("keywords") or "Derived from recent discoveries",
                    "market_angle": f"Lean into the {discovery.get('platform', 'web')} signal.",
                    "recommended_format": "Pilot this as a focused content or product experiment.",
                    "evidence_ids": [discovery.get("id", f"fallback-{index + 1}")],
                }
            )

        return {
            "market_research_summary": "Market research fallback generated from the latest discoveries.",
            "key_signals": [item.get("keywords", "") for item in fallback_discoveries[:3] if item.get("keywords")],
            "options": fallback_options,
        }

    async def generate_finalized_implementation_plan(
        self,
        original_prompt: str,
        winning_option: dict[str, Any],
        discoveries: list[dict[str, str]],
        business_plan: str,
    ) -> dict[str, Any]:
        system_prompt = (
            "You are a product architect turning market research into a build-ready implementation plan. "
            "The final output will be shown directly in the app and used to launch Lovable. "
            "Return ONLY JSON with keys title, one_liner, problem, target_users, value_prop, why_now, "
            "core_user_flows, screens, data_model, workflows, integrations, monetization, launch_plan, "
            "success_metrics, and lovable_prompt. "
            "core_user_flows, integrations, launch_plan, and success_metrics must be arrays of short strings. "
            "screens must be an array of {name, purpose, modules}. "
            "data_model must be an array of {entity, purpose, fields}. "
            "workflows must be an array of {name, trigger, outcome}. "
            "Make the plan specific enough for an app builder to implement immediately. "
            "Keep lovable_prompt concise and focused on MVP scope."
        )
        discovery_lines = []
        for item in discoveries[:12]:
            discovery_lines.append(
                f"- {item.get('platform', '?')} | {item.get('title', '')} | "
                f"{item.get('keywords', '')} | {item.get('summary', '')} | {item.get('source_url', '')}"
            )
        user_prompt = (
            f"ORIGINAL IDEA:\n{original_prompt}\n\n"
            f"WINNING OPTION:\n{json.dumps(winning_option, indent=2)[:1800]}\n\n"
            f"BUSINESS PLAN:\n{business_plan[:1800]}\n\n"
            f"SUPPORTING DISCOVERIES:\n{chr(10).join(discovery_lines) or '(none)'}\n\n"
            "Generate one finalized implementation plan and a concise Lovable prompt."
        )

        try:
            parsed = extract_json_block(
                await self.generate_chat_completion(
                    system_prompt,
                    user_prompt,
                    max_tokens=2200,
                    thought_type="refinement",
                    action_label="finalized_implementation_plan",
                )
            )
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        option_title = str(winning_option.get("title", "")).strip() or original_prompt
        option_concept = str(winning_option.get("concept", "")).strip() or original_prompt
        option_audience = str(winning_option.get("audience", "")).strip() or "Users validated by cross-platform research"
        return {
            "title": option_title,
            "one_liner": option_concept,
            "problem": str(winning_option.get("whyPromising", "")).strip() or "Users repeatedly surfaced this need across social research.",
            "target_users": option_audience,
            "value_prop": str(winning_option.get("marketAngle", "")).strip() or "Deliver a focused MVP grounded in validated demand signals.",
            "why_now": "Cross-platform conversations show active demand and clear unmet expectations.",
            "core_user_flows": [
                "Sign up and onboard by use case",
                "Create the primary project or workspace",
                "Complete the core task with guided automation",
                "Review results and share or export outcomes",
            ],
            "screens": [
                {"name": "Landing", "purpose": "Explain the value proposition and capture signups", "modules": ["Hero", "Proof", "CTA"]},
                {"name": "Dashboard", "purpose": "Summarize active work and next actions", "modules": ["Overview", "Activity feed", "Quick actions"]},
                {"name": "Core workflow", "purpose": "Handle the product's main task flow", "modules": ["Input form", "Execution state", "Results"]},
            ],
            "data_model": [
                {"entity": "users", "purpose": "Account ownership and preferences", "fields": ["email", "name", "plan"]},
                {"entity": "projects", "purpose": "Primary unit of work", "fields": ["title", "status", "owner_id"]},
                {"entity": "artifacts", "purpose": "Store workflow outputs", "fields": ["project_id", "type", "content"]},
            ],
            "workflows": [
                {"name": "Onboarding", "trigger": "New account", "outcome": "Configured workspace"},
                {"name": "Core execution", "trigger": "User starts a task", "outcome": "Task result is generated"},
                {"name": "Share results", "trigger": "User completes workflow", "outcome": "Artifact is shared or exported"},
            ],
            "integrations": ["Email notifications", "Analytics", "Payment processing"],
            "monetization": "Offer a free trial with premium limits unlocked on paid plans.",
            "launch_plan": ["Ship MVP", "Invite pilot users", "Measure activation", "Iterate on retention"],
            "success_metrics": ["Activation rate", "Weekly retained users", "Workflow completion rate"],
            "lovable_prompt": option_concept,
        }

    # ── LLM-driven action planner ────────────────────────────────────
    async def plan_agent_action(self, agent_id: int, platform: str, current_url: str, page_title: str, page_text: str = "") -> dict[str, Any]:
        ctx = agent_context.build_agent_prompt_context(agent_id)
        # Trim page_text to fit token budget
        page_text_trimmed = page_text[:1500] if page_text else "(no text captured)"
        system_prompt = (
            "You are the brain of a content-discovery agent browsing " + platform + ". "
            "You control a real browser. Based on the context, decide the NEXT action.\n\n"
            "Return ONLY a JSON object with these fields:\n"
            '  "action": one of "search", "click_result", "extract_content", "go_back"\n'
            '  "query": (for "search" or "go_back") search query text\n'
            '  "url": (for "click_result") full URL to navigate to\n'
            '  "link_text": (for "click_result") if no URL, descriptive text to search for instead\n'
            '  "reasoning": brief explanation of why this action\n\n'
            "Guidelines:\n"
            "- On search result pages: pick the most promising result URL and click_result with its URL\n"
            "- On content pages: extract_content to capture what you see, then go_back to search\n"
            "- Vary your searches based on what other agents found — explore DIFFERENT angles\n"
            "- Don't repeat the same search. Each search should be unique.\n"
            "- After 3+ pages on one topic, pivot to a new angle.\n"
            "- Look for viral content patterns, engagement hooks, and trending formats."
        )
        user_prompt = (
            f"CONTEXT:\n{ctx}\n\n"
            f"CURRENT STATE:\n"
            f"- URL: {current_url}\n"
            f"- Page title: {page_title}\n"
            f"- Page content (excerpt):\n{page_text_trimmed}\n\n"
            "What should this agent do next? Return JSON only."
        )
        try:
            raw = await self.generate_chat_completion(
                system_prompt, user_prompt, max_tokens=300,
                thought_type="action", agent_id=agent_id, action_label="plan_agent_action",
            )
            parsed = extract_json_block(raw)
            if isinstance(parsed, dict) and "action" in parsed:
                return parsed
        except Exception:
            pass
        return {"action": "search", "query": page_title or "trending content", "reasoning": "fallback"}

    async def coordinate_strategy(self) -> str:
        ctx = agent_context.build_orchestrator_context()
        system_prompt = (
            "You are the orchestrator brain for a 5-agent content discovery swarm. "
            "You read all agents' journals, discoveries, and the current strategy. "
            "Write an UPDATED strategy.md that tells each agent what to focus on next.\n\n"
            "Be specific: mention agent numbers, assign different angles, note which "
            "leads are promising, and which source agents should pivot. Agent 5 is market research, not a browser.\n\n"
            "CRITICAL: Keep it under 150 words. Use bullet points, not paragraphs. "
            "No thinking tags. Format as markdown. Start with '# Strategy' and a phase name."
        )
        user_prompt = f"FULL CONTEXT:\n{ctx}\n\nWrite the updated strategy.md. Be extremely concise."
        try:
            result = await self.generate_chat_completion(
                system_prompt, user_prompt, max_tokens=500,
                thought_type="strategy", action_label="coordinate_strategy",
            )
            if result and "strategy" in result.lower():
                return result
        except Exception:
            pass
        return agent_context.get_strategy()

    async def synthesize_business_plan(
        self,
        original_prompt: str,
        discoveries: list[dict[str, Any]],
        current_plan: str,
        *,
        is_final: bool = False,
    ) -> dict[str, Any]:
        """Synthesize discoveries into a structured business plan."""
        phase_label = "FINAL SYNTHESIS" if is_final else "iterative update"
        system_prompt = (
            f"You are a business strategist performing {phase_label} of a business plan. "
            "You will receive the original idea, discoveries from research agents browsing "
            "YouTube, X/Twitter, Reddit, and Substack, plus the current business plan draft.\n\n"
            "Return ONLY a JSON object with these keys:\n"
            '  "market_opportunity": string (MAX 2 sentences) — market size, demand signals\n'
            '  "competitive_landscape": string (MAX 2 sentences) — gaps and differentiation\n'
            '  "revenue_models": string (MAX 2 sentences) — monetization and pricing\n'
            '  "user_acquisition": string (MAX 2 sentences) — growth channels, go-to-market\n'
            '  "risk_analysis": string (MAX 2 sentences) — key risks and moats\n'
            '  "confidence_score": integer 0-100 — evidence-based confidence\n'
            '  "executive_summary": string (MAX 2 sentences) — overview of refined idea\n'
            '  "recommended_next_steps": array of 3-5 SHORT action items (max 8 words each)\n\n'
            "CRITICAL: Be extremely concise. Each string field must be under 150 characters. "
            "No long paragraphs. No thinking tags. Just the JSON.\n"
        )
        discovery_lines = []
        for item in discoveries[:30]:
            discovery_lines.append(
                f"- [{item.get('platform', '?')}] {item.get('keywords', '')} | "
                f"{item.get('summary', '')} | {item.get('source_url', '')}"
            )
        discoveries_text = "\n".join(discovery_lines) if discovery_lines else "(no discoveries yet)"

        user_prompt = (
            f"ORIGINAL IDEA:\n{original_prompt}\n\n"
            f"CURRENT PLAN DRAFT:\n{current_plan[:1500]}\n\n"
            f"DISCOVERIES ({len(discoveries)} total):\n{discoveries_text}\n\n"
            f"Produce the {'final' if is_final else 'updated'} business plan as JSON."
        )

        try:
            parsed = extract_json_block(
                await self.generate_chat_completion(
                    system_prompt, user_prompt, max_tokens=800,
                    thought_type="refinement", action_label=f"business_plan_{'final' if is_final else 'update'}",
                )
            )
            if isinstance(parsed, dict) and "market_opportunity" in parsed:
                return parsed
        except Exception:
            pass

        return {
            "market_opportunity": "Pending — insufficient discovery data.",
            "competitive_landscape": "Pending — need more research.",
            "revenue_models": "Pending — exploring options.",
            "user_acquisition": "Pending — identifying channels.",
            "risk_analysis": "Pending — assessing risks.",
            "confidence_score": max(5, min(len(discoveries) * 3, 30)),
            "executive_summary": f"Business plan for: {original_prompt}. Research in progress.",
            "recommended_next_steps": ["Continue research", "Gather more discoveries", "Analyze competitive landscape"],
        }


class MasterBuildOrchestrator:
    # ── Platform → LLM routing configuration ────────────────────────
    # Platforms that benefit from GPT-4o-mini's reliable structured output
    # (action-heavy navigation, frequent DOM interactions, bot-hostile sites).
    # All other platforms default to MiniMax M2.7 (deeper reasoning, long-form).
    OPENAI_PLATFORMS: set[str] = {"youtube", "x"}
    MINIMAX_PLATFORMS: set[str] = {"reddit", "substack"}

    def __init__(self) -> None:
        self.client = InsForgeRuntimeClient()
        self.preview_manager = PreviewManager()
        self.ai = MasterBuildAI()
        self.brave = BraveSearchClient()
        self.stop_event = asyncio.Event()
        self.blackboard = deque(maxlen=24)
        self.headless = os.getenv("MASTERBUILD_HEADLESS", "true").lower() != "false"
        self.agent_cycle_delay = float(os.getenv("MASTERBUILD_AGENT_CYCLE_DELAY", "3"))
        self.navigation_wait = float(os.getenv("MASTERBUILD_NAVIGATION_WAIT", "2"))
        # OpenAI config for browser-use navigation on action-heavy platforms
        self._openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self._openai_browser_model = os.getenv("OPENAI_BROWSER_MODEL", "gpt-4o")
        self._openai_mini_model = "gpt-4o-mini"
        self._openai_available = bool(self._openai_api_key)

    def _create_minimax_llm(self):
        """Create a browser-use ChatOpenAI backed by MiniMax M2.7 with think-tag stripping.

        MiniMax M2.7 wraps responses in <think>...</think> tags. browser-use's
        structured output parser (model_validate_json) chokes on that.  We use
        dont_force_structured_output + add_schema_to_system_prompt so the model
        returns plain text, then override ainvoke to strip the think tags and
        parse the JSON ourselves before handing it back.
        """
        from dataclasses import dataclass
        from browser_use.llm.openai.chat import ChatOpenAI as _ChatOpenAI
        from browser_use.llm.views import ChatInvokeCompletion

        @dataclass
        class MiniMaxChat(_ChatOpenAI):
            async def ainvoke(self, messages, output_format=None, **kwargs):
                # Call parent WITHOUT output_format so it returns a raw string
                result = await super().ainvoke(messages, None, **kwargs)
                raw = result.completion if isinstance(result.completion, str) else str(result.completion)
                cleaned = strip_think_tags(raw)

                if output_format is not None:
                    # Parse the cleaned JSON into the expected pydantic model
                    parsed = output_format.model_validate_json(cleaned)
                    return ChatInvokeCompletion(
                        completion=parsed,
                        usage=result.usage,
                        stop_reason=result.stop_reason,
                    )
                return ChatInvokeCompletion(
                    completion=cleaned,
                    usage=result.usage,
                    stop_reason=result.stop_reason,
                )

        return MiniMaxChat(
            model=self.ai.model,
            api_key=self.ai.api_key,
            base_url=self.ai.base_url,
            temperature=0.3,
            max_completion_tokens=4096,
            add_schema_to_system_prompt=True,
        )

    def _create_openai_llm(self):
        """Create a browser-use ChatOpenAI backed by OpenAI GPT-4o-mini.

        GPT-4o-mini natively produces clean structured output that browser-use
        expects, so no think-tag stripping or output_format workarounds needed.
        Used for action-heavy platforms (YouTube, X) where reliable structured
        actions (click, scroll, type) are critical.
        """
        from browser_use.llm.openai.chat import ChatOpenAI as _ChatOpenAI

        return _ChatOpenAI(
            model=self._openai_browser_model,
            api_key=self._openai_api_key,
            base_url="https://api.openai.com/v1",
            temperature=0.2,
            max_completion_tokens=4096,
        )

    def _create_openai_llm_with_model(self, model: str):
        """Create a browser-use ChatOpenAI with a specific OpenAI model."""
        from browser_use.llm.openai.chat import ChatOpenAI as _ChatOpenAI
        return _ChatOpenAI(
            model=model,
            api_key=self._openai_api_key,
            base_url="https://api.openai.com/v1",
            temperature=0.2,
            max_completion_tokens=4096,
        )

    def _create_llm_for_platform(self, platform: str):
        """Select the best browser-use LLM for the given platform.

        Routing logic:
        - youtube → GPT-4o (full model — YouTube's heavy DOM needs strong reasoning)
        - x → GPT-4o-mini (fast structured output for tweet navigation)
        - reddit, substack → MiniMax M2.7 (deeper reasoning over long-form text)

        Falls back to MiniMax if OPENAI_API_KEY is not configured.
        """
        if not self._openai_available and platform in self.OPENAI_PLATFORMS:
            model_label = f"MiniMax {self.ai.model}"
            print(f"[llm-router] Platform '{platform}' prefers OpenAI but OPENAI_API_KEY missing → falling back to {model_label}")
            return self._create_minimax_llm(), model_label

        if platform == "youtube" and self._openai_available:
            model_label = f"OpenAI {self._openai_browser_model}"
            print(f"[llm-router] Platform 'youtube' → {model_label} (full model for heavy DOM)")
            return self._create_openai_llm_with_model(self._openai_browser_model), model_label

        if platform == "x" and self._openai_available:
            model_label = f"OpenAI {self._openai_mini_model}"
            print(f"[llm-router] Platform 'x' → {model_label}")
            return self._create_openai_llm_with_model(self._openai_mini_model), model_label

        model_label = f"MiniMax {self.ai.model}"
        print(f"[llm-router] Platform '{platform}' → {model_label}")
        return self._create_minimax_llm(), model_label

    async def verify_llm(self) -> bool:
        """Health-check LLMs before starting a mission."""
        minimax_ok = False
        try:
            resp = await self.ai.generate_chat_completion("You are a test. Do NOT use any thinking tags. Reply with just the word OK.", "Reply OK.", max_tokens=200)
            if resp and len(resp) > 0:
                print(f"[orchestrator] MiniMax health check passed: {resp}")
                minimax_ok = True
        except Exception as e:
            print(f"[orchestrator] ⚠ MiniMax health check FAILED: {e}")

        if self._openai_available:
            try:
                test_client = AsyncOpenAI(api_key=self._openai_api_key)
                test_resp = await test_client.chat.completions.create(
                    model=self._openai_browser_model,
                    messages=[{"role": "user", "content": "Reply OK."}],
                    max_tokens=10,
                )
                if test_resp.choices and test_resp.choices[0].message.content:
                    print(f"[orchestrator] OpenAI ({self._openai_browser_model}) health check passed")
                await test_client.close()
            except Exception as e:
                print(f"[orchestrator] ⚠ OpenAI health check FAILED: {e} — YouTube/X agents will fall back to MiniMax")
                self._openai_available = False
        else:
            print("[orchestrator] ⚠ OPENAI_API_KEY not set — all browser agents will use MiniMax M2.7")

        return minimax_ok

    async def close(self) -> None:
        await self.brave.close()
        await self.ai.close()
        await self.client.close()

    async def watch_forever(self) -> None:
        print("[orchestrator] Watching for missions...")
        while True:
            try:
                mission = await self.client.get_latest_mission()
                if mission and mission.get("status") in {"queued", "active"}:
                    print(f"[orchestrator] Found mission: {mission.get('id')} — {mission.get('prompt', '')[:60]}")
                    await self.run_mission(mission)
                else:
                    print(f"[orchestrator] No active mission, waiting... (status={mission.get('status') if mission else 'none'})")
            except Exception as e:
                import traceback
                print(f"[orchestrator] watch error: {e!r}")
                traceback.print_exc()
            await asyncio.sleep(15)

    async def run_mission(self, mission: dict[str, Any]) -> None:
        mission_id = str(mission["id"])
        prompt = str(mission.get("prompt", ""))
        self.stop_event.clear()
        self.blackboard.clear()

        # ── Initialize shared MD context ───────────────────────────────
        agent_context.init_mission_context(
            prompt,
            [{"agent_id": s.agent_id, "name": s.name, "platform": s.platform, "role": s.role} for s in AGENT_SPECS],
        )

        llm_ok = await self.verify_llm()
        if not llm_ok:
            await self.client.update_mission(mission_id, status="error", stopped_at=utc_now())
            await self.client.append_log(mission_id, agent_id=None, log_type="error", message="❌ MiniMax key is invalid or expired. Set a valid MINIMAX_API_KEY in .env.local and restart.", metadata={})
            return

        await self.client.update_mission(
            mission_id,
            status="active",
            started_at=utc_now(),
            final_options=None,
        )
        openai_platforms = ", ".join(sorted(self.OPENAI_PLATFORMS)) if self._openai_available else "none (fallback to MiniMax)"
        minimax_platforms = ", ".join(sorted(self.MINIMAX_PLATFORMS))
        await self.client.append_log(
            mission_id,
            agent_id=None,
            log_type="status",
            message=f"Mission activated — Dual-LLM routing: OpenAI [{openai_platforms}] | MiniMax [{minimax_platforms}]",
            metadata={"brave_enabled": self.brave.enabled, "openai_available": self._openai_available, "openai_model": self._openai_browser_model},
        )
        if not self.brave.enabled:
            await self.client.append_log(
                mission_id,
                agent_id=None,
                log_type="error",
                message="⚠ BRAVE_SEARCH_API_KEY is missing. Source agents will fall back to direct platform browsing.",
                metadata={},
            )

        platform_labels = {
            "youtube": "YouTube videos",
            "x": "X conversations",
            "reddit": "Reddit discussions",
            "substack": "Substack essays",
        }
        platform_terms = {
            platform: await self.ai.generate_terms(prompt, platform_labels[platform], 3)
            for platform in BROWSING_PLATFORMS
        }
        curated_links = {
            platform: await self.brave.curate_links(platform, platform_terms[platform], max_results=6)
            for platform in BROWSING_PLATFORMS
        }

        tasks = []
        market_research_spec: AgentSpec | None = None
        browser_agent_index = 0
        for spec in AGENT_SPECS:
            if spec.platform == "market_research":
                market_research_spec = spec
                tasks.append(
                    asyncio.create_task(
                        self.run_market_research_agent(
                            spec,
                            mission_id=mission_id,
                            mission_prompt=prompt,
                        )
                    )
                )
                continue

            # Stagger browser launches by 12s each to avoid Chromium startup contention in non-headless mode
            stagger_delay = browser_agent_index * 12
            browser_agent_index += 1
            tasks.append(
                asyncio.create_task(
                    self._staggered_run_agent(
                        stagger_delay,
                        spec,
                        mission_id=mission_id,
                        mission_prompt=prompt,
                        seed_queries=platform_terms[spec.platform],
                        curated_links=curated_links.get(spec.platform, []),
                    )
                )
            )
        control_task = asyncio.create_task(self.monitor_control_commands(mission_id))
        strategy_task = asyncio.create_task(self.periodic_strategy_update(mission_id))
        business_plan_task = asyncio.create_task(self.periodic_business_plan_synthesis(mission_id, prompt))
        builder_trigger_task = asyncio.create_task(self.monitor_builder_trigger(mission_id, prompt))

        try:
            pending = tasks + [control_task]
            while pending and not self.stop_event.is_set():
                done, _ = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                if control_task in done:
                    break
                pending = [task for task in pending if not task.done()]
                if all(task.done() for task in tasks):
                    break
        finally:
            self.stop_event.set()
            strategy_task.cancel()
            business_plan_task.cancel()
            builder_trigger_task.cancel()
            for task in tasks + [control_task]:
                task.cancel()
            await asyncio.gather(*tasks, control_task, strategy_task, business_plan_task, builder_trigger_task, return_exceptions=True)

            # ── Final business plan synthesis ──────────────────────────
            try:
                discoveries = await self.client.get_recent_discoveries(30)
                if discoveries:
                    current_plan = agent_context.get_business_plan()
                    discovery_dicts = [
                        {"platform": d.get("platform", ""), "keywords": d.get("keywords", ""),
                         "summary": d.get("summary", ""), "source_url": d.get("source_url", "")}
                        for d in discoveries
                    ]
                    final_plan = await self.ai.synthesize_business_plan(
                        prompt, discovery_dicts, current_plan, is_final=True,
                    )
                    plan_md = (
                        f"# Business Plan (FINAL)\n\n"
                        f"**Idea:** {prompt}\n"
                        f"**Confidence:** {final_plan.get('confidence_score', 0)}%\n"
                        f"**Based on:** {len(discoveries)} discoveries\n\n"
                        f"## Executive Summary\n\n{final_plan.get('executive_summary', '')}\n\n"
                        f"## Market Opportunity\n\n{final_plan.get('market_opportunity', '')}\n\n"
                        f"## Competitive Landscape\n\n{final_plan.get('competitive_landscape', '')}\n\n"
                        f"## Revenue Models\n\n{final_plan.get('revenue_models', '')}\n\n"
                        f"## User Acquisition\n\n{final_plan.get('user_acquisition', '')}\n\n"
                        f"## Risk & Moat Analysis\n\n{final_plan.get('risk_analysis', '')}\n\n"
                        f"## Recommended Next Steps\n\n"
                    )
                    for step in (final_plan.get("recommended_next_steps") or []):
                        plan_md += f"- {step}\n"
                    agent_context.update_business_plan(plan_md)
                    await self.client.append_business_plan(
                        mission_id, version=999,
                        market_opportunity=str(final_plan.get("market_opportunity", ""))[:500],
                        competitive_landscape=str(final_plan.get("competitive_landscape", ""))[:500],
                        revenue_models=str(final_plan.get("revenue_models", ""))[:500],
                        user_acquisition=str(final_plan.get("user_acquisition", ""))[:500],
                        risk_analysis=str(final_plan.get("risk_analysis", ""))[:500],
                        confidence_score=int(final_plan.get("confidence_score", 0)),
                        discovery_count=len(discoveries), is_final=True, raw_plan=plan_md[:2000],
                    )
                    await self.client.append_log(
                        mission_id, agent_id=None, log_type="status",
                        message=f"📋 FINAL business plan synthesized (confidence: {final_plan.get('confidence_score', 0)}%)",
                        metadata={},
                    )
            except Exception as e:
                print(f"[orchestrator] final business plan error: {e}")

            if market_research_spec is not None:
                try:
                    await self._update_market_research_output(
                        mission_id,
                        prompt,
                        spec=market_research_spec,
                        is_final=True,
                    )
                except Exception as error:
                    await self.client.append_log(
                        mission_id,
                        agent_id=market_research_spec.agent_id,
                        log_type="error",
                        message=f"Market research finalization failed: {error}",
                        metadata={},
                    )

            await self.client.update_mission(mission_id, status="stopped", stopped_at=utc_now())
            await self.client.append_log(mission_id, agent_id=None, log_type="status", message="Mission halted.", metadata={})
            agent_context.disable_insforge_sync()

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

    async def periodic_strategy_update(self, mission_id: str) -> None:
        """Periodically ask MiniMax to update the shared strategy.md."""
        await asyncio.sleep(15)
        while not self.stop_event.is_set():
            try:
                new_strategy = await self.ai.coordinate_strategy()
                agent_context.update_strategy(new_strategy)
                await self.client.append_log(
                    mission_id, agent_id=None, log_type="status",
                    message="🧠 Strategy updated by orchestrator brain.",
                    metadata={"strategy_preview": new_strategy[:200]},
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(25)

    async def periodic_business_plan_synthesis(self, mission_id: str, prompt: str) -> None:
        """Periodically synthesize discoveries into a structured business plan."""
        plan_version = 0
        last_discovery_count = 0
        synthesis_threshold = 5  # synthesize every N new discoveries
        await asyncio.sleep(40)  # Let agents gather initial data
        while not self.stop_event.is_set():
            try:
                discoveries = await self.client.get_recent_discoveries(30)
                new_count = len(discoveries)
                if new_count >= last_discovery_count + synthesis_threshold:
                    last_discovery_count = new_count
                    plan_version += 1
                    current_plan = agent_context.get_business_plan()

                    discovery_dicts = [
                        {
                            "platform": d.get("platform", ""),
                            "keywords": d.get("keywords", ""),
                            "summary": d.get("summary", ""),
                            "source_url": d.get("source_url", ""),
                        }
                        for d in discoveries
                    ]

                    plan_data = await self.ai.synthesize_business_plan(
                        prompt, discovery_dicts, current_plan,
                    )

                    # Write structured plan to business_plan.md
                    plan_md = (
                        f"# Business Plan (v{plan_version})\n\n"
                        f"**Idea:** {prompt}\n"
                        f"**Confidence:** {plan_data.get('confidence_score', 0)}%\n"
                        f"**Based on:** {new_count} discoveries\n\n"
                        f"## Executive Summary\n\n{plan_data.get('executive_summary', 'Pending...')}\n\n"
                        f"## Market Opportunity\n\n{plan_data.get('market_opportunity', 'Pending...')}\n\n"
                        f"## Competitive Landscape\n\n{plan_data.get('competitive_landscape', 'Pending...')}\n\n"
                        f"## Revenue Models\n\n{plan_data.get('revenue_models', 'Pending...')}\n\n"
                        f"## User Acquisition\n\n{plan_data.get('user_acquisition', 'Pending...')}\n\n"
                        f"## Risk & Moat Analysis\n\n{plan_data.get('risk_analysis', 'Pending...')}\n\n"
                        f"## Recommended Next Steps\n\n"
                    )
                    next_steps = plan_data.get("recommended_next_steps", [])
                    if isinstance(next_steps, list):
                        for step in next_steps:
                            plan_md += f"- {step}\n"

                    agent_context.update_business_plan(plan_md)

                    # Write to InsForge business_plans table
                    await self.client.append_business_plan(
                        mission_id,
                        version=plan_version,
                        market_opportunity=str(plan_data.get("market_opportunity", ""))[:500],
                        competitive_landscape=str(plan_data.get("competitive_landscape", ""))[:500],
                        revenue_models=str(plan_data.get("revenue_models", ""))[:500],
                        user_acquisition=str(plan_data.get("user_acquisition", ""))[:500],
                        risk_analysis=str(plan_data.get("risk_analysis", ""))[:500],
                        confidence_score=int(plan_data.get("confidence_score", 0)),
                        discovery_count=new_count,
                        is_final=False,
                        raw_plan=plan_md[:2000],
                    )

                    await self.client.append_log(
                        mission_id, agent_id=None, log_type="status",
                        message=f"📋 Business plan v{plan_version} synthesized (confidence: {plan_data.get('confidence_score', 0)}%, {new_count} discoveries)",
                        metadata={"version": plan_version, "confidence": plan_data.get("confidence_score", 0)},
                    )

                    # Increase threshold as plan matures
                    synthesis_threshold = min(synthesis_threshold + 2, 12)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[orchestrator] business plan synthesis error: {e}")
            await asyncio.sleep(30)

    async def monitor_builder_trigger(self, mission_id: str, prompt: str) -> None:
        """Watch business plan confidence and launch the builder agent when ready.

        The builder runs a refinement loop internally (build → evaluate → refine).
        After builder finishes, if still below proficiency target and agents are running,
        we signal them to research the gaps and re-trigger the builder.
        """
        builder_launched = False
        confidence_threshold = 40
        await asyncio.sleep(60)  # Let research agents and plan synthesis warm up
        while not self.stop_event.is_set() and not builder_launched:
            try:
                plans = await self.client.list_records(
                    "business_plans",
                    params={
                        "mission_id": f"eq.{mission_id}",
                        "order": "created_at.desc",
                        "limit": 1,
                    },
                )
                if plans:
                    confidence = int(plans[0].get("confidence_score", 0))
                    if confidence >= confidence_threshold:
                        builder_launched = True
                        await self.client.append_log(
                            mission_id, agent_id=None, log_type="status",
                            message=f"🚀 Business plan confidence {confidence}% >= {confidence_threshold}% — launching Builder Agent (with refinement loop)",
                            metadata={"confidence": confidence},
                        )
                        builder = BuilderAgent(self.ai, self.client, mission_id, prompt)
                        result = await builder.run(self.stop_event)
                        # Log final builder result
                        proficiency = result.get("proficiency_eval", {}).get("score", 0) if isinstance(result, dict) else 0
                        await self.client.append_log(
                            mission_id, agent_id=None, log_type="status",
                            message=f"🏁 Builder finished — proficiency {proficiency}%",
                            metadata={"proficiency": proficiency},
                        )
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[orchestrator] builder trigger error: {e}")
            if not builder_launched:
                await asyncio.sleep(20)

    def _discovery_signature(self, discoveries: list[dict[str, Any]]) -> str:
        return "|".join(str(item.get("id", "")) for item in discoveries[:16])

    def _normalize_implementation_plan(
        self,
        raw_plan: dict[str, Any],
        *,
        fallback_title: str,
        fallback_one_liner: str,
        evidence: list[dict[str, str]],
    ) -> dict[str, Any]:
        title = str(raw_plan.get("title", "")).strip() or fallback_title
        one_liner = str(raw_plan.get("one_liner", "")).strip() or fallback_one_liner

        return {
            "generatedBy": "MiniMax-M2.7",
            "title": title,
            "oneLiner": one_liner,
            "problem": str(raw_plan.get("problem", "")).strip() or "Validated demand surfaced from the four target platforms.",
            "targetUsers": str(raw_plan.get("target_users", "")).strip() or "Users identified in the winning research option.",
            "valueProp": str(raw_plan.get("value_prop", "")).strip() or "Deliver the most urgent user outcome with a focused MVP.",
            "whyNow": str(raw_plan.get("why_now", "")).strip() or "Current social signals show sustained urgency and clear product gaps.",
            "coreUserFlows": _clean_string_list(raw_plan.get("core_user_flows"), limit=6),
            "screens": _normalize_plan_items(raw_plan.get("screens"), keys=("name", "purpose", "modules"), list_keys=("modules",), limit=6),
            "dataModel": _normalize_plan_items(raw_plan.get("data_model"), keys=("entity", "purpose", "fields"), list_keys=("fields",), limit=6),
            "workflows": _normalize_plan_items(raw_plan.get("workflows"), keys=("name", "trigger", "outcome"), limit=6),
            "integrations": _clean_string_list(raw_plan.get("integrations"), limit=6),
            "monetization": str(raw_plan.get("monetization", "")).strip() or "Monetize through a focused subscription or usage-based offering.",
            "launchPlan": _clean_string_list(raw_plan.get("launch_plan"), limit=6),
            "successMetrics": _clean_string_list(raw_plan.get("success_metrics"), limit=6),
            "sourceEvidence": evidence,
        }

    async def _build_final_options_payload(
        self,
        prompt: str,
        discoveries: list[dict[str, Any]],
        *,
        is_final: bool,
    ) -> dict[str, Any]:
        discovery_dicts = [
            {
                "id": str(item.get("id", "")),
                "platform": str(item.get("platform", "")),
                "title": str(item.get("title", "")),
                "keywords": str(item.get("keywords", "")),
                "summary": str(item.get("summary", "")),
                "source_url": str(item.get("source_url", "")),
            }
            for item in discoveries
        ]
        valid_discoveries = filter_valid_discoveries(discovery_dicts)
        coverage = build_platform_coverage(valid_discoveries)

        report = await self.ai.generate_market_research_report(prompt, valid_discoveries or discovery_dicts)
        discovery_map = {
            str(item.get("id", "")): item
            for item in (valid_discoveries or discovery_dicts)
            if str(item.get("id", "")).strip()
        }

        options: list[dict[str, Any]] = []
        raw_options = report.get("options", [])
        if not isinstance(raw_options, list):
            raw_options = []

        for index, raw_option in enumerate(raw_options[:3]):
            if not isinstance(raw_option, dict):
                continue
            evidence: list[dict[str, str]] = []
            seen_urls: set[str] = set()
            raw_evidence_ids = raw_option.get("evidence_ids", [])
            if isinstance(raw_evidence_ids, list):
                for evidence_id in raw_evidence_ids:
                    item = discovery_map.get(str(evidence_id))
                    if not item:
                        continue
                    url = item.get("source_url", "")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    evidence.append(
                        {
                            "id": item.get("id", ""),
                            "platform": item.get("platform", ""),
                            "title": item.get("title", ""),
                            "keywords": item.get("keywords", ""),
                            "summary": item.get("summary", ""),
                            "url": url,
                        }
                    )

            if not evidence and (valid_discoveries or discovery_dicts):
                fallback_source = valid_discoveries or discovery_dicts
                fallback_item = fallback_source[index % len(fallback_source)]
                evidence.append(
                    {
                        "id": fallback_item.get("id", ""),
                        "platform": fallback_item.get("platform", ""),
                        "title": fallback_item.get("title", ""),
                        "keywords": fallback_item.get("keywords", ""),
                        "summary": fallback_item.get("summary", ""),
                        "url": fallback_item.get("source_url", ""),
                    }
                )

            options.append(
                {
                    "id": f"option-{index + 1}",
                    "title": str(raw_option.get("title", f"Option {index + 1}")).strip(),
                    "concept": str(raw_option.get("concept", "")).strip(),
                    "audience": str(raw_option.get("audience", "")).strip(),
                    "whyPromising": str(raw_option.get("why_promising", "")).strip(),
                    "marketAngle": str(raw_option.get("market_angle", "")).strip(),
                    "recommendedFormat": str(raw_option.get("recommended_format", "")).strip(),
                    "evidence": evidence,
                }
            )

        while len(options) < 3:
            fallback_source = valid_discoveries or discovery_dicts
            fallback_item = fallback_source[len(options) % len(fallback_source)] if fallback_source else None
            options.append(
                {
                    "id": f"option-{len(options) + 1}",
                    "title": fallback_item.get("keywords", f"Option {len(options) + 1}") if fallback_item else f"Option {len(options) + 1}",
                    "concept": fallback_item.get("summary", prompt) if fallback_item else prompt,
                    "audience": "Teams evaluating validated idea directions",
                    "whyPromising": fallback_item.get("keywords", "Derived from current discoveries") if fallback_item else "Derived from current discoveries",
                    "marketAngle": f"Use the {fallback_item.get('platform', 'market')} signal to shape positioning." if fallback_item else "Use the strongest available signal to shape positioning.",
                    "recommendedFormat": "Pilot this direction as a narrow first release or testable content format.",
                    "evidence": [
                        {
                            "id": fallback_item.get("id", ""),
                            "platform": fallback_item.get("platform", ""),
                            "title": fallback_item.get("title", ""),
                            "keywords": fallback_item.get("keywords", ""),
                            "summary": fallback_item.get("summary", ""),
                            "url": fallback_item.get("source_url", ""),
                        }
                    ] if fallback_item else [],
                }
            )

        raw_signals = report.get("key_signals", [])
        signals = [str(item).strip() for item in raw_signals if str(item).strip()] if isinstance(raw_signals, list) else []
        summary = str(report.get("market_research_summary", "")).strip() or (
            f"Generated market research from {len(valid_discoveries or discovery_dicts)} platform discoveries."
        )
        primary_option = select_primary_option(options) or {
            "id": "option-1",
            "title": prompt,
            "concept": prompt,
            "audience": "Users surfaced from current research",
            "whyPromising": summary,
            "marketAngle": summary,
            "recommendedFormat": "Focused MVP",
            "evidence": [],
        }
        final_evidence = build_plan_source_evidence(
            primary_option,
            valid_discoveries,
            coverage["completedPlatforms"],
        )
        business_plan = agent_context.get_business_plan()
        raw_plan = await self.ai.generate_finalized_implementation_plan(
            prompt,
            primary_option,
            valid_discoveries,
            business_plan,
        )
        implementation_plan = self._normalize_implementation_plan(
            raw_plan if isinstance(raw_plan, dict) else {},
            fallback_title=primary_option["title"],
            fallback_one_liner=primary_option["concept"],
            evidence=final_evidence,
        )
        lovable_prompt = str((raw_plan or {}).get("lovable_prompt", "")).strip() if isinstance(raw_plan, dict) else ""
        if not lovable_prompt:
            lovable_prompt = build_lovable_prompt_from_plan(implementation_plan)
        lovable_handoff = {
            "title": implementation_plan["title"],
            "prompt": lovable_prompt[:LOVABLE_PROMPT_MAX_CHARS],
            "launchUrl": build_lovable_launch_url(lovable_prompt),
            "evidence": final_evidence,
        }

        return {
            "generatedAt": utc_now(),
            "isFinal": is_final,
            "marketResearch": {
                "summary": summary,
                "signals": signals[:6],
            },
            "options": options[:3],
            "primaryOptionId": primary_option["id"],
            "coverage": coverage,
            "implementationPlan": implementation_plan,
            "lovableHandoff": lovable_handoff,
        }

    async def _update_market_research_output(
        self,
        mission_id: str,
        prompt: str,
        *,
        spec: AgentSpec,
        is_final: bool,
    ) -> dict[str, Any] | None:
        discoveries = await self.client.get_recent_discoveries(24)
        if not discoveries:
            return None

        payload = await self._build_final_options_payload(prompt, discoveries, is_final=is_final)
        summary = str(payload["marketResearch"]["summary"])
        await self.client.update_mission(
            mission_id,
            final_options=payload,
            refined_idea=summary,
        )
        await self.preview_manager.publish(
            spec.agent_id,
            status="found_trend" if is_final else "searching",
            title="Lovable handoff ready" if payload["coverage"]["readyForLovable"] else "Refreshing market research",
            current_url="",
            note=(
                f"{len(payload['options'])} options, winner: {payload['implementationPlan']['title']}"
                if payload["coverage"]["readyForLovable"]
                else f"Waiting on platforms: {', '.join(payload['coverage']['missingPlatforms'])}"
            ),
            screenshot_path=None,
        )
        await self.client.update_agent(
            spec.agent_id,
            mission_id=mission_id,
            status="found_trend" if is_final else "searching",
            current_url="",
            assignment=summary[:120],
            energy=90 if is_final else 75,
            last_heartbeat=utc_now(),
        )
        await self.client.append_log(
            mission_id,
            agent_id=spec.agent_id,
            log_type="market_research",
            message=summary,
            metadata={
                "discovery_count": len(discoveries),
                "is_final": is_final,
                "signals": payload["marketResearch"]["signals"],
            },
        )
        await self.client.append_log(
            mission_id,
            agent_id=spec.agent_id,
            log_type="final_options",
            message=(
                f"Generated finalized implementation plan for {payload['implementationPlan']['title']}."
                if payload["coverage"]["readyForLovable"]
                else f"Generated {len(payload['options'])} market-backed options; waiting for full platform coverage."
            ),
            metadata=payload,
        )
        return payload

    async def run_market_research_agent(
        self,
        spec: AgentSpec,
        *,
        mission_id: str,
        mission_prompt: str,
    ) -> None:
        last_signature = ""
        try:
            await self.preview_manager.publish(
                spec.agent_id,
                status="searching",
                title="Waiting for discoveries",
                current_url="",
                note="Monitoring source agents before market research begins.",
                screenshot_path=None,
            )
            await self.client.update_agent(
                spec.agent_id,
                mission_id=mission_id,
                status="searching",
                current_url="",
                assignment="Monitoring discoveries",
                energy=100,
                last_heartbeat=utc_now(),
            )
            await self.client.append_log(
                mission_id,
                agent_id=spec.agent_id,
                log_type="status",
                message="📈 Market research agent is monitoring discoveries.",
                metadata={},
            )

            while not self.stop_event.is_set():
                discoveries = await self.client.get_recent_discoveries(24)
                valid_discoveries = filter_valid_discoveries(discoveries)
                coverage = build_platform_coverage(valid_discoveries)
                if coverage["readyForLovable"]:
                    signature = self._discovery_signature(valid_discoveries)
                    if signature != last_signature:
                        await self._update_market_research_output(
                            mission_id,
                            mission_prompt,
                            spec=spec,
                            is_final=False,
                        )
                        last_signature = signature
                else:
                    await self.preview_manager.publish(
                        spec.agent_id,
                        status="searching",
                        title="Waiting for discoveries",
                        current_url="",
                        note=(
                            f"Validated platforms: {len(coverage['completedPlatforms'])}/{len(LOVABLE_REQUIRED_PLATFORMS)}. "
                            f"Missing: {', '.join(coverage['missingPlatforms']) or 'none'}."
                        ),
                        screenshot_path=None,
                    )
                    await self.client.update_agent(
                        spec.agent_id,
                        mission_id=mission_id,
                        status="searching",
                        current_url="",
                        assignment="Waiting for source discoveries",
                        energy=100,
                        last_heartbeat=utc_now(),
                    )
                await asyncio.sleep(20)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self.client.update_agent(
                spec.agent_id,
                status="error",
                energy=0,
                last_heartbeat=utc_now(),
            )
            await self.client.append_log(
                mission_id,
                agent_id=spec.agent_id,
                log_type="error",
                message=f"Market research agent error: {error}",
                metadata={},
            )
        finally:
            await self.client.update_agent(
                spec.agent_id,
                status="stopped",
                session_id=None,
                preview_bucket=None,
                preview_key=None,
                preview_updated_at=None,
                last_heartbeat=utc_now(),
            )

    # ── Browser-Use Agent-driven browsing ────────────────────────────

    async def _extract_page_content(self, browser: BrowserSession, url: str) -> str:
        """Extract structured text content from the current page via JS.

        Returns a compact string with visible text, engagement metrics (if any),
        and platform-specific signals. Never throws — always returns a string.
        """
        try:
            page = await browser.get_current_page()
            if page is None:
                return ""

            is_youtube = "youtube.com" in url or "youtu.be" in url
            is_twitter = "x.com" in url or "twitter.com" in url
            is_reddit = "reddit.com" in url
            is_substack = "substack.com" in url

            if is_youtube:
                result = await page.evaluate("""() => {
                    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1#title yt-formatted-string, ytd-shorts h2')?.innerText || '';
                    const desc = document.querySelector('ytd-text-inline-expander #content, #description-inline-expander #content, ytd-expander #content')?.innerText?.slice(0, 600) || '';
                    const views = document.querySelector('.view-count, #info span.ytd-video-view-count-renderer, #shorts-container ytd-reel-player-overlay-renderer .yt-spec-button-shape-next__button-text-content')?.innerText || '';
                    const likes = document.querySelector('#segmented-like-button .yt-spec-button-shape-next__button-text-content, ytd-menu-renderer #top-level-buttons-computed ytd-toggle-button-renderer:first-child #text')?.innerText || '';
                    const channel = document.querySelector('ytd-channel-name #channel-name, #channel-name yt-formatted-string')?.innerText || '';
                    const comments = Array.from(document.querySelectorAll('ytd-comment-thread-renderer #content-text')).slice(0, 5).map(el => el.innerText?.slice(0, 120)).join(' | ');
                    const related = Array.from(document.querySelectorAll('ytd-compact-video-renderer #video-title, ytd-reel-item-renderer #video-title')).slice(0, 5).map(el => el.innerText).join(', ');
                    return [
                        title ? 'Title: ' + title : '',
                        channel ? 'Channel: ' + channel : '',
                        views ? 'Views: ' + views : '',
                        likes ? 'Likes: ' + likes : '',
                        desc ? 'Description: ' + desc : '',
                        comments ? 'Top comments: ' + comments : '',
                        related ? 'Related videos: ' + related : '',
                    ].filter(Boolean).join('\\n');
                }""")
            elif is_twitter:
                result = await page.evaluate("""() => {
                    const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(0, 8).map(t => {
                        const text = t.querySelector('[data-testid="tweetText"]')?.innerText || '';
                        const likes = t.querySelector('[data-testid="like"] span')?.innerText || '';
                        const replies = t.querySelector('[data-testid="reply"] span')?.innerText || '';
                        const reposts = t.querySelector('[data-testid="retweet"] span')?.innerText || '';
                        return `"${text.slice(0, 200)}" [likes:${likes} replies:${replies} reposts:${reposts}]`;
                    }).join('\\n');
                    const heading = document.querySelector('h1, [data-testid="UserName"] span')?.innerText || '';
                    return (heading ? 'Account/topic: ' + heading + '\\n' : '') + (tweets || document.body?.innerText?.slice(0, 1000) || '');
                }""")
            elif is_reddit:
                result = await page.evaluate("""() => {
                    const title = document.querySelector('h1[slot="title"], [data-testid="post-title"], shreddit-post h1')?.innerText || document.querySelector('h1')?.innerText || '';
                    const score = document.querySelector('[data-testid="post-vote-count"], faceplate-number[pretty]')?.innerText || '';
                    const body = document.querySelector('[data-testid="post-rtjson-content"], .md, [slot="text-body"]')?.innerText?.slice(0, 500) || '';
                    const comments = Array.from(document.querySelectorAll('[data-testid="comment"], shreddit-comment')).slice(0, 6).map(c => c.querySelector('p, [slot="comment"]')?.innerText?.slice(0, 150)).filter(Boolean).join(' | ');
                    const subreddit = document.querySelector('[data-testid="subreddit-name"], a[href*="/r/"]')?.innerText || '';
                    return [
                        title ? 'Post: ' + title : '',
                        subreddit ? 'Subreddit: ' + subreddit : '',
                        score ? 'Score: ' + score : '',
                        body ? 'Body: ' + body : '',
                        comments ? 'Comments: ' + comments : '',
                    ].filter(Boolean).join('\\n');
                }""")
            elif is_substack:
                result = await page.evaluate("""() => {
                    const title = document.querySelector('h1.post-title, h1')?.innerText || '';
                    const subtitle = document.querySelector('h3.post-subtitle, .subtitle')?.innerText || '';
                    const body = document.querySelector('.available-content, .post-content, article')?.innerText?.slice(0, 800) || '';
                    const author = document.querySelector('.byline-names, .author-name')?.innerText || '';
                    const subs = document.querySelector('.subscriber-count, .pub-stats')?.innerText || '';
                    return [
                        title ? 'Title: ' + title : '',
                        subtitle ? 'Subtitle: ' + subtitle : '',
                        author ? 'Author: ' + author : '',
                        subs ? 'Subscribers: ' + subs : '',
                        body ? 'Content: ' + body : '',
                    ].filter(Boolean).join('\\n');
                }""")
            else:
                # Generic: grab visible text up to 1500 chars
                result = await page.evaluate("""() => {
                    const skip = new Set(['script','style','noscript','svg','iframe']);
                    function getText(el) {
                        if (!el || skip.has(el.tagName?.toLowerCase())) return '';
                        if (el.nodeType === 3) return el.textContent || '';
                        return Array.from(el.childNodes).map(getText).join(' ');
                    }
                    return getText(document.body).replace(/\\s+/g, ' ').trim().slice(0, 1500);
                }""")

            return str(result or "").strip()
        except Exception as exc:
            print(f"[extract_page_content] {exc}")
            return ""

    # Stealth JS injected on every new document to suppress automation fingerprints
    _STEALTH_SCRIPT = """
() => {
    // Hide navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // Spoof plugins
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
    // Spoof languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    // Override permissions query to behave like real browser
    const origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (origQuery) {
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : origQuery(parameters);
    }
    // Chrome runtime stub (some sites check for window.chrome)
    if (!window.chrome) {
        window.chrome = { runtime: {} };
    }
}
"""

    async def _inject_stealth_scripts(self, browser: BrowserSession) -> None:
        """Register stealth JS to run on every new document load."""
        try:
            page = await browser.get_current_page()
            if page is None:
                return
            # Playwright's addInitScript runs the JS before any page scripts
            await page.add_init_script(self._STEALTH_SCRIPT)
        except Exception as exc:
            print(f"[stealth] script injection failed: {exc}")

    async def _take_agent_screenshot(self, browser: BrowserSession, spec: AgentSpec) -> str | None:
        try:
            sdir = self.preview_manager._agent_dir(spec.agent_id)
            sdir.mkdir(parents=True, exist_ok=True)
            path = str(sdir / "screenshot.jpeg")
            await browser.take_screenshot(path=path, format="jpeg", quality=75)
            return path
        except Exception:
            return None

    def _build_agent_task(
        self,
        spec: AgentSpec,
        mission_prompt: str,
        seed_queries: list[str],
        curated_links: list[dict[str, str]],
    ) -> str:
        """Build the task description for a browser-use Agent with business-model focus."""

        # Platform-specific deep-navigation instructions + direct search URLs
        platform_instructions: dict[str, dict[str, str]] = {
            "youtube": {
                "search_url": f"https://www.youtube.com/results?search_query={seed_queries[0].replace(' ', '+') if seed_queries else 'trending'}",
                "guide": (
                    "You are a business researcher browsing YouTube like a real person would.\n\n"
                    "STEP-BY-STEP ACTIONS (follow this exactly):\n\n"
                    "PHASE 1 — SEARCH & SCAN:\n"
                    "1. You will land on a YouTube search results page. Wait for it to fully load.\n"
                    "2. Scroll down SLOWLY 2-3 times to see more results. Read all the video titles visible.\n"
                    "3. Pick the MOST RELEVANT video to the business mission — click its thumbnail or title.\n\n"
                    "PHASE 2 — DEEP DIVE (repeat for 5-8 videos):\n"
                    "4. On the video page: scroll down to see the description box. Click 'Show more' if visible.\n"
                    "5. Read the FULL video title, view count, like count, and upload date.\n"
                    "6. Read the description — look for: pricing, product links, affiliate links, business models.\n"
                    "7. Scroll to the comments section. Read the top 5-8 comments. Look for:\n"
                    "   - Complaints ('this doesn't work', 'too expensive', 'I wish...')\n"
                    "   - Questions ('how do I...', 'where can I...')\n"
                    "   - Success stories ('I made $X doing this')\n"
                    "8. Click the channel name to see subscriber count. Then press Back.\n"
                    "9. Click the NEXT relevant video from search results.\n\n"
                    "PHASE 3 — SECOND QUERY:\n"
                    "10. After 3-4 videos, click the YouTube search bar, clear it, type the SECOND seed query, press Enter.\n"
                    "11. Repeat Phase 2 for 3-4 more videos.\n\n"
                    "WHAT TO EXTRACT (be specific — exact numbers):\n"
                    "- View count (e.g. '1.2M views') and like count\n"
                    "- Channel subscriber count (e.g. '450K subscribers')\n"
                    "- Revenue/pricing mentioned in description or video\n"
                    "- Top pain points from comments (quote them verbatim)\n"
                    "- Business model insights (how creators monetize this niche)\n\n"
                    "IMPORTANT RULES:\n"
                    "- Do NOT stay on the search results page. You MUST click into actual videos.\n"
                    "- Do NOT just read titles from search results — you must open videos and scroll.\n"
                    "- If YouTube shows a consent/cookie popup, click 'Accept all' or 'Reject all'.\n"
                    "- If asked to sign in, click 'No thanks' or press Escape and continue.\n"
                    "- If a page loads blank or empty, wait 5 seconds then try navigating again."
                ),
            },
            "x": {
                "search_url": f"https://x.com/search?q={seed_queries[0].replace(' ', '%20') if seed_queries else 'trending'}&f=live",
                "guide": (
                    "You are researching X (Twitter) for pain points and market signals.\n\n"
                    "NAVIGATION PROTOCOL:\n"
                    "1. Start at the search URL above (filters to live/latest tweets).\n"
                    "2. Scroll to see at least 10–15 tweets on the search results page.\n"
                    "3. Click into 4–5 tweet threads that look like they contain complaints, "
                    "   product discussions, or 'I wish someone would build X' statements.\n"
                    "4. On each thread: read the full thread including replies. Note like/retweet/reply counts.\n"
                    "5. Click on 2–3 account profiles to check follower count and what they sell/promote.\n"
                    "6. Search for a second seed query using the search bar.\n\n"
                    "WHAT TO EXTRACT:\n"
                    "- Direct quotes of pain points (exact wording)\n"
                    "- Products being complained about or praised (with engagement counts)\n"
                    "- Accounts with 10k+ followers who are influencers in this space\n"
                    "- Threads where people are asking for solutions that don't exist yet\n\n"
                    "BOT EVASION: X.com allows searching without login. If asked to log in, "
                    "close the modal (press Escape or click X) and continue browsing the search results."
                ),
            },
            "reddit": {
                "search_url": f"https://www.reddit.com/search/?q={seed_queries[0].replace(' ', '+') if seed_queries else 'help'}&sort=top&t=year",
                "guide": (
                    "You are researching Reddit for unmet needs and market gaps.\n\n"
                    "NAVIGATION PROTOCOL:\n"
                    "1. Start at the search URL above (sorts by top posts in the past year).\n"
                    "2. Click into the 6–8 most upvoted posts from results.\n"
                    "3. On each post: read the FULL body text, then scroll and read the top 8–10 comments. "
                    "   Note the post score (upvotes) and comment count.\n"
                    "4. Check the subreddit name — click it to see the subscriber count and community description.\n"
                    "5. After the first query, search for the second seed query.\n\n"
                    "WHAT TO EXTRACT:\n"
                    "- Post score and comment count (demand signal strength)\n"
                    "- Subreddit subscriber count (market size proxy)\n"
                    "- Direct quotes like 'I'd pay for', 'take my money', 'I wish'\n"
                    "- DIY workarounds people have built (signals unmet commercial need)\n"
                    "- Names of tools/products being recommended or criticised\n\n"
                    "BOT EVASION: Reddit is mostly accessible without login. If a login wall appears, "
                    "scroll past it — Reddit lazy-loads content. Try appending .json to the URL for raw data."
                ),
            },
            "substack": {
                "search_url": f"https://substack.com/search?query={seed_queries[0].replace(' ', '%20') if seed_queries else 'trends'}",
                "guide": (
                    "You are researching Substack for industry narratives and market intelligence.\n\n"
                    "NAVIGATION PROTOCOL:\n"
                    "1. Start at the search URL above.\n"
                    "2. Click into 5–7 newsletter posts from the results.\n"
                    "3. On each article: read the FULL article (scroll to the end), note the publication name "
                    "   and subscriber count if visible. Note any pricing tiers mentioned.\n"
                    "4. Click the newsletter/publication name to see its subscriber count and about page.\n"
                    "5. Look for articles with large comment sections — click into 2–3 comments.\n\n"
                    "WHAT TO EXTRACT:\n"
                    "- Market size estimates and revenue figures quoted by authors\n"
                    "- Competitor names and their stated pricing / positioning\n"
                    "- Expert predictions and trend calls (with publication name and sub count)\n"
                    "- Business model breakdowns (how companies make money in this space)\n"
                    "- Reader comments that reveal unmet needs or strong opinions\n\n"
                    "BOT EVASION: Substack is mostly open. If a paywall appears on an article, "
                    "read the visible portion and move to the next result."
                ),
            },
        }

        p_data = platform_instructions.get(spec.platform, {
            "search_url": f"https://www.google.com/search?q={seed_queries[0].replace(' ', '+') if seed_queries else mission_prompt.replace(' ', '+')}",
            "guide": "Search the web for relevant content.",
        })
        search_url = p_data["search_url"]
        platform_guide = p_data["guide"]

        strategy = agent_context.get_strategy()
        business_plan = agent_context.get_business_plan()
        bp_summary = business_plan[:800] if len(business_plan) > 800 else business_plan
        queries_text = "\n".join(f"- {query}" for query in seed_queries)
        curated_text = "\n".join(
            f"- {item['title'] or item['url']} | {item['url']}"
            for item in curated_links[:6]
        ) or "- No curated links available — use the DIRECT SEARCH URL below."

        return (
            f"You are Agent {spec.agent_id} ({spec.name}), a {spec.role} agent browsing {spec.platform}.\n\n"
            f"MISSION: {mission_prompt}\n\n"
            f"SEED QUERIES:\n{queries_text}\n\n"
            f"DIRECT SEARCH URL (start here if curated links are weak):\n{search_url}\n\n"
            f"CURATED LINKS TO TRY FIRST:\n{curated_text}\n\n"
            f"=== PLATFORM GUIDE ===\n{platform_guide}\n\n"
            f"CURRENT BUSINESS PLAN STATE:\n{bp_summary}\n\n"
            f"STRATEGY FROM ORCHESTRATOR:\n{strategy}\n\n"
            f"=== EXECUTION RULES ===\n"
            f"1. DO NOT stay on the homepage. Navigate INTO actual posts, videos, and threads.\n"
            f"2. For EVERY page you visit: scroll down at least 3 times to load more content.\n"
            f"3. Read descriptions, bodies, and top comments on every content page you open.\n"
            f"4. Cover at least 6 distinct content pieces before finishing.\n"
            f"5. If a page blocks you or shows a bot check: wait 3 seconds, scroll, try again.\n"
            f"6. If completely blocked, navigate to the DIRECT SEARCH URL above as a fallback.\n"
            f"7. Extract BUSINESS INTELLIGENCE: view counts, engagement metrics, pricing signals, "
            f"   pain points quoted verbatim, monetisation patterns, audience sizes.\n"
            f"8. Your findings feed a live business plan — be thorough and specific.\n"
        )

    async def _staggered_run_agent(self, delay: float, spec: AgentSpec, **kwargs) -> None:
        """Wait `delay` seconds then launch run_agent — prevents Chromium startup contention."""
        if delay > 0:
            print(f"[orchestrator] Agent {spec.name} ({spec.platform}) waiting {delay}s for staggered launch...")
            await asyncio.sleep(delay)
        await self.run_agent(spec, **kwargs)

    async def run_agent(
        self,
        spec: AgentSpec,
        *,
        mission_id: str,
        mission_prompt: str,
        seed_queries: list[str],
        curated_links: list[dict[str, str]],
    ) -> None:
        last_preview_key: str | None = None
        browser: BrowserSession | None = None
        step_count = 0
        primary_query = seed_queries[0] if seed_queries else mission_prompt

        async def on_step_end(step_result):
            """Called after every browser-use Agent step — capture state and report."""
            nonlocal step_count, last_preview_key
            step_count += 1
            try:
                page_url = await browser.get_current_page_url() or ""
                page_title = await browser.get_current_page_title() or ""
                screenshot_path = await self._take_agent_screenshot(browser, spec)

                # Extract real page content for context and discovery summarisation
                page_content = await self._extract_page_content(browser, page_url)

                # Log to MD context with actual page content
                agent_context.log_agent_observation(spec.agent_id, page_url, page_title, f"step {step_count}", page_content)

                # Update preview
                await self.preview_manager.publish(
                    spec.agent_id, status="searching", title=page_title,
                    current_url=page_url, note=f"step {step_count}",
                    screenshot_path=screenshot_path,
                )

                # Upload screenshot to InsForge
                preview_upload = None
                if screenshot_path:
                    try:
                        preview_upload = await self.client.upload_preview_frame(spec.agent_id, screenshot_path)
                        uploaded_key = str(preview_upload.get("key", "")).strip()
                        uploaded_bucket = str(preview_upload.get("bucket", self.client.preview_bucket)).strip() or self.client.preview_bucket
                        if last_preview_key and last_preview_key != uploaded_key:
                            await self.client.delete_storage_object(uploaded_bucket, last_preview_key)
                        last_preview_key = uploaded_key or None
                    except Exception:
                        pass

                # Update agent status in InsForge
                await self.client.update_agent(
                    spec.agent_id, mission_id=mission_id, status="searching",
                    current_url=page_url, assignment=page_title[:100],
                    energy=max(10, 100 - step_count * 2), last_heartbeat=utc_now(),
                )

                # Log to InsForge
                await self.client.append_log(
                    mission_id, agent_id=spec.agent_id, log_type="search",
                    message=f"Browsing: {page_title[:60]} | {page_url[:60]}",
                    metadata={"step": step_count},
                )

                # Create discovery for new URLs
                if page_url and page_url not in _seen_urls:
                    _seen_urls.add(page_url)
                    keywords, summary = await self.ai.summarize_discovery(mission_prompt, primary_query, page_title, page_url, page_content)
                    if keywords and keywords != "fallback" and is_valid_platform_content_url(spec.platform, page_url) and summary.strip():
                        self.blackboard.appendleft(keywords)
                        agent_context.log_discovery(spec.agent_id, spec.platform, keywords, summary, page_url)
                        await self.client.append_discovery(
                            mission_id,
                            agent_id=spec.agent_id,
                            platform=spec.platform,
                            title=page_title or keywords,
                            source_url=page_url,
                            thumbnail_url=f"/api/agent-stream/{spec.agent_id}/frame",
                            keywords=keywords,
                            summary=summary,
                        )
                        await self.client.append_log(
                            mission_id, agent_id=spec.agent_id, log_type="discovery",
                            message=f"Found: {keywords}", metadata={"url": page_url},
                        )
                    elif is_valid_platform_content_url(spec.platform, page_url) is False:
                        await self.client.append_log(
                            mission_id,
                            agent_id=spec.agent_id,
                            log_type="search",
                            message=f"Skipped non-content page: {page_title[:60] or page_url[:60]}",
                            metadata={"url": page_url, "platform": spec.platform},
                        )

                # Check if mission should stop
                if self.stop_event.is_set():
                    raise asyncio.CancelledError("Mission stopped")

            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[agent {spec.agent_id}] step callback error: {e}")

        # Cross-agent URL dedup: load URLs already discovered by ALL agents
        _seen_urls: set[str] = await self.client.get_all_discovered_urls(mission_id)

        try:
            browser = build_local_browser_session(spec.agent_id, spec.platform, headless=self.headless)

            # Inject stealth scripts on every new page to suppress automation signals
            await self._inject_stealth_scripts(browser)

            task_description = self._build_agent_task(spec, mission_prompt, seed_queries, curated_links)
            llm, model_label = self._create_llm_for_platform(spec.platform)

            agent_context.log_agent_action(spec.agent_id, "start", f"Seed queries: {', '.join(seed_queries)}")
            await self.client.append_log(
                mission_id, agent_id=spec.agent_id, log_type="status",
                message=f"🚀 Agent {spec.name} starting with browser-use + {model_label}",
                metadata={"seed_queries": seed_queries, "curated_links": curated_links[:3], "llm": model_label},
            )

            # Platform-tuned step limits: YouTube needs more steps for deep video exploration
            max_steps = 90 if spec.platform == "youtube" else 60

            # Run browser-use Agent — it handles ALL browsing intelligence
            browsing_agent = Agent(
                task=task_description,
                llm=llm,
                browser_session=browser,
            )
            history = await browsing_agent.run(
                max_steps=max_steps,
                on_step_end=on_step_end,
            )

            # Agent finished — log final result
            final_result = history.final_result() if hasattr(history, 'final_result') else str(history)
            agent_context.log_agent_action(spec.agent_id, "done", str(final_result)[:200])
            await self.client.update_agent(
                spec.agent_id, status="found_trend",
                energy=50, last_heartbeat=utc_now(),
            )
            await self.client.append_log(
                mission_id, agent_id=spec.agent_id, log_type="status",
                message=f"✅ Agent {spec.name} completed {step_count} steps",
                metadata={},
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self.client.update_agent(
                spec.agent_id, status="error", energy=0, last_heartbeat=utc_now(),
            )
            await self.client.append_log(
                mission_id, agent_id=spec.agent_id, log_type="error",
                message=f"Agent {spec.name} error: {error}", metadata={},
            )
            agent_context.log_agent_action(spec.agent_id, "error", str(error)[:200])
        finally:
            if browser is not None:
                try:
                    await browser.stop()
                except Exception:
                    pass
            if last_preview_key:
                await self.client.delete_storage_object(self.client.preview_bucket, last_preview_key)
            await self.client.update_agent(
                spec.agent_id, status="stopped", session_id=None,
                preview_bucket=None, preview_key=None,
                preview_updated_at=None, last_heartbeat=utc_now(),
            )


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

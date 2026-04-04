# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**MasterBuild** is an autonomous multi-agent business research system. Users submit a business idea; 5 AI agents concurrently browse YouTube, X, Reddit, Substack, and Brave Search using headless Chromium, then synthesize findings into a live business plan. A 6th Builder Agent (Forge) then auto-designs an app schema, scaffold, and monetization strategy. Everything streams to a 3D Next.js dashboard in real time via InsForge.

## Commands

### Frontend (Next.js)
```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

### Python Orchestrator
```bash
source .venv/bin/activate
pip install -r requirements.txt    # One-time setup
python orchestrator.py             # Start the agent swarm
```

### Tests
```bash
# Python unit tests
source .venv/bin/activate
python -m pytest tests/ -v
python -m pytest tests/test_agent_context.py -v   # Single file

# E2E (requires running dev server + orchestrator)
npx playwright test
```

### Database migrations
Apply `insforge/masterbuild_schema.sql` then `insforge/masterbuild_schema_v2.sql` via InsForge's `run-raw-sql` MCP tool (or InsForge dashboard SQL editor). v2 adds `agent_memory`, `agent_thoughts`, `business_plans`, `builder_outputs`.

## Architecture

### Runtime split

The system has two fully independent runtimes that talk only through InsForge:

**Python orchestrator** (`masterbuild_runtime.py`, ~2000 lines) — runs locally, owns all browsing and AI reasoning.

**Next.js frontend** (`app/`) — pure display layer; reads InsForge via realtime WebSocket and REST.

### Python subsystems

| File | Role |
|------|------|
| `orchestrator.py` | Entry point — calls `run_masterbuild()` |
| `masterbuild_runtime.py` | Everything: BraveSearchClient, InsForgeRuntimeClient, MasterBuildAI, MasterBuildOrchestrator, all 5 agent runners |
| `builder_agent.py` | Agent 6 — 5-stage app builder (schema → scaffold → features → deploy → monetization) |
| `agent_context.py` | Shared memory: dual-writes markdown to `runtime/context/` AND to InsForge `agent_memory` table |
| `livestream_tiktok.py` | Browser session factory — stealth args, UA rotation, profile paths, NopeCHA extension loading |

### Agent swarm

| ID | Name | Platform | Finds |
|----|------|----------|-------|
| 1 | Echo | YouTube Shorts | Viral formats, view counts, creator monetization |
| 2 | Pulse | X/Twitter | Pain points, feature requests, pricing complaints |
| 3 | Thread | Reddit | Willingness-to-pay signals, subreddit size (market proxy) |
| 4 | Ledger | Substack | Expert market analysis, competitor breakdowns |
| 5 | Atlas | Brave API | Market sizing (no browser — polls discoveries) |
| 6 | Forge | InsForge | Builder — activates at ≥40% plan confidence |

Agents 1–4 run `browser-use` Agent loops (max 60 steps each). The LLM driving browser-use is MiniMax M2.7 via an OpenAI-compatible API.

### Shared memory flow

```
on_step_end (every browser step)
  → _extract_page_content()   JS extraction (platform-specific: YT views/comments, Reddit scores, etc.)
  → log_agent_observation()   → agent-{id}.md + InsForge agent_memory
  → summarize_discovery()     LLM with page_content → keywords + summary
  → append_discovery()        → InsForge discoveries table

Every ~25s: periodic_strategy_update() rewrites strategy.md
Every ~30s: periodic_business_plan_synthesis() rewrites business_plan.md + appends business_plans row
Every 20s (Atlas): generate_market_research_report() → updates mission.final_options
```

### InsForge backend

InsForge is the only shared state between Python and Next.js. It provides PostgreSQL (via PostgREST), realtime pub/sub, file storage, and auth.

- **Python** uses `InsForgeRuntimeClient` (raw httpx, Bearer token auth)
- **Next.js** uses `@insforge/sdk` (`app/lib/insforge.ts` and `app/lib/insforge-server.ts`)

Realtime channels the frontend subscribes to: `missions`, `agents`, `discoveries`, `logs`, `signals`, `agent_memory`, `agent_thoughts`, `business_plans`, `builder_outputs`.

### Preview/livestream system

No external streaming service. Per step:
1. Python writes `runtime/previews/agent-{id}/screenshot.jpeg` + `metadata.json`
2. Python uploads the same frame to InsForge Storage (`agent-previews` bucket)
3. Next.js API routes (`/api/agent-stream/[agentId]/frame` and `/status`) serve the local file
4. Frontend embeds these as `<img>` src in the 3D scene

### Bot detection strategy

`livestream_tiktok.py` applies layered evasion:
- `--headless=new` (not old headless), `--disable-blink-features=AutomationControlled`
- Per-agent randomised user agent + window size
- NopeCHA Chromium extension (`extensions/nopecha/`) auto-solves hCaptcha, reCAPTCHA v2/v3, Cloudflare Turnstile, FunCaptcha
- Stealth JS injected via `addInitScript` at browser startup (hides `navigator.webdriver`, stubs `window.chrome`)
- Persistent browser profiles per agent (maintains login sessions)

NopeCHA requires an API key set through its popup settings page.

### Frontend structure

`app/page.tsx` is the dashboard shell. Two modes toggled from `CommandOverlay`:
- **Command Center** — `CommandCenterScene.tsx` (Three.js/R3F): 3D nodes for each agent, animated signal particles, live browser iframes
- **Agent Stream** — `app/agent-stream/[agentId]/page.tsx`: per-agent log/thought feed

Main realtime data hook: `useMasterBuildDashboard.ts` — owns InsForge subscriptions, mission start/stop/reset, all table polling.

## Environment

Copy `.env.example` → `.env.local`. Required vars:

| Var | Used by |
|-----|---------|
| `NEXT_PUBLIC_INSFORGE_URL` / `MASTERBUILD_INSFORGE_URL` | Frontend + Python |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | Frontend SDK auth |
| `MASTERBUILD_INSFORGE_TOKEN` | Python runtime auth |
| `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` | All LLM calls |
| `BRAVE_SEARCH_API_KEY` | Link curation before browsers open |
| `MASTERBUILD_HEADLESS` | `true` = headless Chromium (default) |
| `MASTERBUILD_PROFILE_1..5` | Absolute paths to persistent Chrome profiles |

## Key constraints

- **Tailwind is locked to 3.4** — do not upgrade to v4.
- **MiniMax M2.7** is the only LLM (`MASTERBUILD_AI_MODEL`). All completions go through `MasterBuildAI.generate_chat_completion()` — extend there, not by calling OpenAI directly.
- **`agent_context.py` is the only place** that writes MD files — always use its functions (`log_discovery`, `log_agent_action`, `log_agent_observation`, `update_strategy`, etc.) rather than writing files directly.
- **`InsForgeRuntimeClient`** is the only place that writes to InsForge from Python — don't add direct httpx calls elsewhere.
- The `builder_outputs` table schema exists but BuilderAgent pipeline is only partially wired into the orchestrator — check `monitor_builder_trigger()` before extending it.

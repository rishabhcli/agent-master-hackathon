# MasterBuild

MasterBuild is an autonomous multi-agent system that researches, validates, and builds business ideas. It uses a swarm of six AI agents orchestrated by MiniMax M2.7 to browse YouTube, X, Reddit, and Substack for market intelligence, synthesize a structured business plan, and then auto-design an app via InsForge.

## Stack

- **Next.js App Router** — 3D command center + real-time observability dashboard
- **InsForge** — Database, realtime pub/sub, auth, storage, and deployment
- **MiniMax M2.7** — LLM brain for all agents (OpenAI-compatible API)
- **Brave Search** — Curated starting links for each platform
- **browser-use** — Local headless browser automation for each agent
- **Python asyncio** — Orchestrator coordinating all agents concurrently

## Architecture

### Agent Swarm

| Agent | Platform | Role |
|-------|----------|------|
| 1 — Echo | YouTube | Viral formats, creator monetization patterns, engagement hooks |
| 2 — Pulse | X/Twitter | Pain points, feature requests, trending opinions |
| 3 — Thread | Reddit | Unmet community needs, willingness-to-pay signals |
| 4 — Ledger | Substack | Industry narratives, market analysis, expert opinions |
| 5 — Atlas | Brave API | Market sizing, competitors, pricing intelligence |
| 6 — Forge | InsForge | Builder agent — auto-designs app from business plan |

### Data Flow

```
Research Agents (1-5)        Orchestrator (MiniMax)         Builder Agent (6)
  │ browse platforms  ──►  │ periodic strategy update   │
  │ write discoveries ──►  │ periodic business plan     │
  │                        │ synthesis every ~30s       │
  │                        │ confidence tracking        ──► triggers at ≥40%
  │                        │                            │   schema → scaffold
  │                        │                            │   → features → deploy
  │                        │                            │   → monetization
  └────────────────────────┴────────────────────────────┘
         ▼                           ▼                           ▼
    InsForge DB ◄──── realtime channels ────► Next.js UI
```

### Shared Memory

All agents share context through a dual-write system:
- **Local MD files** (`runtime/context/`) for fast LLM prompt assembly
- **InsForge `agent_memory` table** for persistence, crash recovery, and real-time sync
- Files: `mission.md`, `strategy.md`, `discoveries.md`, `business_plan.md`, `builder_report.md`, `agent-{id}.md`

### Observability

Every LLM call is logged to `agent_thoughts` with prompt/response summaries, token counts, and latency. The UI provides two views:
- **Command Center** — 3D scene with live agent browser previews
- **Agent Stream** — Real-time feed of agent thoughts, signals, memory files, and evolving business plan

## Database Schema

Two migration files, applied in order:
1. `insforge/masterbuild_schema.sql` — Core tables (missions, agents, discoveries, logs, signals, control_commands)
2. `insforge/masterbuild_schema_v2.sql` — v2 tables (agent_memory, agent_thoughts, business_plans, builder_outputs)

Apply both via the InsForge MCP `run-raw-sql` tool.

## Setup

1. Install frontend dependencies:

```bash
npm install
```

2. Install Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Copy the environment template:

```bash
cp .env.example .env.local
```

4. Fill in these values:

- `NEXT_PUBLIC_INSFORGE_ANON_KEY`
- `MASTERBUILD_INSFORGE_TOKEN`
- `MINIMAX_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `MASTERBUILD_PROFILE_1` through `MASTERBUILD_PROFILE_5`

`NEXT_PUBLIC_INSFORGE_URL`, `MASTERBUILD_INSFORGE_URL`, and `MINIMAX_BASE_URL` default to the linked backend and the international MiniMax endpoint.

5. Apply the database schema (both files, in order) via InsForge MCP `run-raw-sql`.

6. Start the UI:

```bash
npm run dev
```

7. Start the orchestrator in another terminal:

```bash
source .venv/bin/activate
python orchestrator.py
```

You can also use the helper scripts:

```bash
./start_orchestrator.sh
./start_mission_watcher.sh
```

## Mission Flow

1. Enter a business idea in the command overlay.
2. The UI creates a mission via InsForge RPC.
3. The orchestrator detects the mission, generates platform-specific search terms with MiniMax, and curates starting links via Brave Search.
4. Five research agents browse their assigned platforms with a business-model focus, writing discoveries to InsForge.
5. Every ~30 seconds, the orchestrator synthesizes discoveries into a structured business plan (market opportunity, competitive landscape, revenue models, user acquisition, risk analysis).
6. Once the business plan reaches ≥40% confidence, the Builder Agent (Forge) activates and designs: database schema, app scaffold, feature specs, deployment plan, and monetization strategy.
7. All progress is logged in real-time — switch to **Agent Stream** view to watch agents think and collaborate.

## Testing

```bash
# Python unit tests (26 tests)
source .venv/bin/activate
python -m pytest tests/ -v

# TypeScript type checking
npm run typecheck

# E2E tests (requires running system)
npx playwright test
```

## Key Files

- `app/page.tsx` — Dashboard shell with Command Center ↔ Agent Stream toggle
- `app/components/ObservabilityDashboard.tsx` — Agent Feed, Business Plan, Shared Memory tabs
- `app/components/AgentConversationFeed.tsx` — Real-time agent thought/signal/log feed
- `app/components/BusinessPlanEvolution.tsx` — Versioned business plan with confidence tracking
- `app/hooks/useMasterBuildDashboard.ts` — Realtime subscriptions to all InsForge channels
- `masterbuild_runtime.py` — Orchestrator, AI methods, business plan synthesis, builder trigger
- `builder_agent.py` — Builder Agent: schema → scaffold → features → deploy → monetization
- `agent_context.py` — Dual-write shared memory (local MD + InsForge DB)
- `insforge/masterbuild_schema.sql` — Core database schema
- `insforge/masterbuild_schema_v2.sql` — v2 schema (memory, thoughts, plans, builder outputs)

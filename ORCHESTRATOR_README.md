# Orchestrator

The worker runtime lives in `masterbuild_runtime.py` with the builder agent in `builder_agent.py` and shared memory in `agent_context.py`.

## Responsibilities

- Poll InsForge for queued missions
- Activate a mission and manage six coordinated agents
- Generate per-platform search terms using MiniMax via `https://api.minimax.io/v1`
- Curate relevant source links through Brave Search before browsing
- Write agent state, logs, discoveries, and signals back into InsForge
- Maintain the blackboard keyword queue used for reassignment
- **Dual-write all agent context** to local MD files and InsForge `agent_memory` table
- **Periodically synthesize a business plan** from discoveries (~every 30s)
- **Log every LLM call** to `agent_thoughts` table for observability
- **Auto-trigger the Builder Agent** when business plan confidence reaches ≥40%
- Generate structured market-research options from the browsed discoveries
- Watch `control_commands` for stop requests
- On mission end, produce a **final business plan synthesis** and **builder report**

## Agent Layout

| ID | Name | Platform | Business Focus |
|----|------|----------|---------------|
| 1 | Echo | YouTube | Viral formats, monetization patterns, engagement hooks |
| 2 | Pulse | X/Twitter | Pain points, feature requests, trending opinions |
| 3 | Thread | Reddit | Unmet needs, willingness-to-pay, niche communities |
| 4 | Ledger | Substack | Industry narratives, market analysis, pricing insights |
| 5 | Atlas | Brave API | Market sizing, competitors, funding signals |
| 6 | Forge | InsForge | App design: schema → scaffold → features → deploy → monetization |

## Concurrent Tasks

During a mission, the orchestrator runs these parallel async tasks:

- **5 browser agents** — each browsing their platform
- **Control monitor** — watches for stop commands
- **Strategy update** — periodic orchestrator strategy refinement
- **Business plan synthesis** — consolidates discoveries into structured plan
- **Builder trigger** — monitors plan confidence and launches Forge agent

## Shared Memory System

All context is dual-written:
- **Local**: `runtime/context/{filename}.md` — fast reads for LLM prompt assembly
- **InsForge**: `agent_memory` table — persistent, crash-recoverable, real-time sync

On startup, `hydrate_from_insforge()` restores local files from the DB (crash recovery).

Files maintained:
- `mission.md` — objective and agent roster
- `strategy.md` — orchestrator strategy (updated periodically)
- `discoveries.md` — aggregated findings from all agents
- `business_plan.md` — structured business plan (updated every ~30s)
- `builder_report.md` — builder agent output summary
- `agent-{id}.md` — per-agent learning journal

## Runtime Commands

Start the main loop:

```bash
source .venv/bin/activate
python orchestrator.py
```

Alternative entrypoint:

```bash
source .venv/bin/activate
python mission_livestream_watcher.py
```

## Environment

- `MASTERBUILD_INSFORGE_URL`
- `MASTERBUILD_INSFORGE_TOKEN`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `BRAVE_SEARCH_API_KEY`
- `MASTERBUILD_AI_MODEL`
- `MASTERBUILD_RUNTIME_DIR`
- `MASTERBUILD_HEADLESS`
- `MASTERBUILD_NAVIGATION_WAIT`
- `MASTERBUILD_AGENT_CYCLE_DELAY`
- `MASTERBUILD_PROFILE_1` through `MASTERBUILD_PROFILE_5`

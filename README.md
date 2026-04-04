# MasterBuild

MasterBuild is a local-only content-discovery command center built with Next.js, InsForge, MiniMax, and Python browser workers. The UI launches and monitors nine concurrent agents across TikTok, YouTube Shorts, and DuckDuckGo while local browser sessions stream frame previews back into the 3D command center.

## Stack

- Next.js App Router for the fullscreen command center UI
- InsForge database + realtime
- MiniMax chat completions for discovery inference
- Local `browser-use` sessions for browser automation
- Python orchestration for agent coordination, blackboard reassignment, and preview capture

## Backend Architecture

MasterBuild uses InsForge in two places:

- Database tables for missions, agents, discoveries, logs, signals, and control commands
- Realtime channels backed by database triggers so the UI can refresh when state changes

MiniMax handles AI inference through the official OpenAI-compatible endpoint at `https://api.minimax.io/v1`, using `MINIMAX_API_KEY` and `MASTERBUILD_AI_MODEL`.

The schema lives in [insforge/masterbuild_schema.sql](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/insforge/masterbuild_schema.sql) and is intended to be applied with the InsForge MCP `run_raw_sql` tool.

## Local Browser Runtime

The Python worker layer is local-only:

- each agent uses a local `browser-use` browser session
- TikTok agents can reuse dedicated local Chrome profiles through `MASTERBUILD_TIKTOK_PROFILE_1..3`
- each agent writes `latest.jpg` and `metadata.json` into `runtime/previews/agent-{n}`
- Next.js serves those previews at `/agent-stream/1` through `/agent-stream/9`

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
- `MASTERBUILD_TIKTOK_PROFILE_1`
- `MASTERBUILD_TIKTOK_PROFILE_2`
- `MASTERBUILD_TIKTOK_PROFILE_3`

`NEXT_PUBLIC_INSFORGE_URL`, `MASTERBUILD_INSFORGE_URL`, and `MINIMAX_BASE_URL` default to the linked backend and the international MiniMax endpoint.

5. Start the UI:

```bash
npm run dev
```

6. Start the worker loop in another terminal:

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

1. Enter a mission brief in the command overlay.
2. The UI calls the `start_masterbuild_mission` InsForge RPC.
3. InsForge seeds the mission, agents, logs, and local preview URLs.
4. The Python worker detects the queued mission, activates it, generates search terms with MiniMax, and launches local browser sessions.
5. Each agent updates InsForge records, writes preview frames locally, and contributes discoveries to the shared blackboard.
6. Weak agents are reassigned using recent blackboard keywords.

## Key Files

- [app/page.tsx](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/page.tsx)
- [app/hooks/useMasterBuildDashboard.ts](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/hooks/useMasterBuildDashboard.ts)
- [app/components/CommandCenterScene.tsx](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/components/CommandCenterScene.tsx)
- [app/agent-stream/[agentId]/page.tsx](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/agent-stream/[agentId]/page.tsx)
- [masterbuild_runtime.py](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/masterbuild_runtime.py)
- [livestream_tiktok.py](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/livestream_tiktok.py)
- [insforge/masterbuild_schema.sql](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/insforge/masterbuild_schema.sql)

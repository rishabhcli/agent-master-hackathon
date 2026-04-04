# Orchestrator

The worker runtime lives in [masterbuild_runtime.py](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/masterbuild_runtime.py).

## Responsibilities

- poll InsForge for queued missions
- activate a mission and spawn nine local browser agents
- generate per-platform search terms using MiniMax via `https://api.minimax.io/v1`
- write agent state, logs, discoveries, and signals back into InsForge
- maintain the blackboard keyword queue used for reassignment
- lower agent energy on failures and reset energy on successful discoveries
- watch `control_commands` for stop requests

## Agent Layout

- Agents 1-3: TikTok
- Agents 4-6: YouTube Shorts
- Agents 7-9: DuckDuckGo

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
- `MASTERBUILD_AI_MODEL`
- `MASTERBUILD_RUNTIME_DIR`
- `MASTERBUILD_HEADLESS`
- `MASTERBUILD_NAVIGATION_WAIT`
- `MASTERBUILD_AGENT_CYCLE_DELAY`
- `MASTERBUILD_TIKTOK_PROFILE_1`
- `MASTERBUILD_TIKTOK_PROFILE_2`
- `MASTERBUILD_TIKTOK_PROFILE_3`

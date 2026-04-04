# Local Preview System

MasterBuild does not depend on any cloud livestream service. Each agent preview is produced locally and served by the Next.js app.

## How It Works

1. The Python worker captures a frame from the local browser session with `browser-use`.
2. The worker copies that frame to:

```text
runtime/previews/agent-{id}/latest.jpg
```

3. The worker also writes:

```text
runtime/previews/agent-{id}/metadata.json
```

4. Next.js serves each panel through:

- `/agent-stream/1`
- `/agent-stream/2`
- ...
- `/agent-stream/9`

5. The 3D scene embeds those routes in iframes.

## Runtime Files

- [app/api/agent-stream/[agentId]/frame/route.ts](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/api/agent-stream/[agentId]/frame/route.ts)
- [app/api/agent-stream/[agentId]/status/route.ts](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/api/agent-stream/[agentId]/status/route.ts)
- [app/components/AgentPreviewSurface.tsx](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/components/AgentPreviewSurface.tsx)
- [app/lib/runtime.ts](/Users/rishabhbansal/Documents/GitHub/agent-master-hackathon/app/lib/runtime.ts)

## Profile Expectations

TikTok agents should use local authenticated profiles through:

- `MASTERBUILD_TIKTOK_PROFILE_1`
- `MASTERBUILD_TIKTOK_PROFILE_2`
- `MASTERBUILD_TIKTOK_PROFILE_3`

If those values are not set, the worker falls back to repo-local browser profile directories under `runtime/browser/`.

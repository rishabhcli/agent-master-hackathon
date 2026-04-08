import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createServerInsforgeClient,
  hasPreviewAccess,
  isSameOriginRequest,
  NO_STORE_HEADERS
} from "../../../lib/insforge-server";

export const dynamic = "force-dynamic";

const AGENT_ROWS = [
  { agentId: 1, name: "Echo", platform: "youtube", role: "Shorts Scan", previewUrl: "/agent-stream/1" },
  { agentId: 2, name: "Pulse", platform: "x", role: "Conversation Scan", previewUrl: "/agent-stream/2" },
  { agentId: 3, name: "Thread", platform: "reddit", role: "Community Scan", previewUrl: "/agent-stream/3" },
  { agentId: 4, name: "Ledger", platform: "substack", role: "Narrative Scan", previewUrl: "/agent-stream/4" },
  { agentId: 5, name: "Atlas", platform: "market_research", role: "Market Research", previewUrl: "/agent-stream/5" }
] as const;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden_origin");
  }

  if (!(await hasPreviewAccess(request))) {
    return errorResponse(401, "unauthorized");
  }

  let prompt = "";
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return errorResponse(400, "invalid_json");
  }

  if (!prompt) {
    return errorResponse(400, "mission_prompt_required");
  }

  try {
    const insforge = createServerInsforgeClient();
    const missionId = randomUUID();
    const timestamp = new Date().toISOString();
    const missionInsert = await insforge.database.from("missions").insert([
      {
        id: missionId,
        prompt,
        status: "queued",
        live_url_1: "/agent-stream/1",
        live_url_2: "/agent-stream/2",
        live_url_3: "/agent-stream/3",
        live_url_4: "/agent-stream/4",
        live_url_5: "/agent-stream/5",
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    if (missionInsert.error) {
      throw missionInsert.error;
    }

    try {
      const agentInsert = await insforge.database.from("agents").insert(
        AGENT_ROWS.map((agent) => ({
          mission_id: missionId,
          agent_id: agent.agentId,
          name: agent.name,
          platform: agent.platform,
          role: agent.role,
          status: "idle",
          preview_url: agent.previewUrl,
          assignment: prompt,
          energy: 100,
          created_at: timestamp,
          updated_at: timestamp,
          last_heartbeat: timestamp
        }))
      );

      if (agentInsert.error) {
        throw agentInsert.error;
      }

      const logInsert = await insforge.database.from("logs").insert([
        {
          mission_id: missionId,
          agent_id: null,
          type: "status",
          message: "Mission queued and awaiting worker pickup.",
          metadata: { prompt },
          created_at: timestamp
        }
      ]);

      if (logInsert.error) {
        throw logInsert.error;
      }
    } catch (insertError) {
      await insforge.database.from("missions").delete().eq("id", missionId);
      throw insertError;
    }

    return NextResponse.json(
      {
        ok: true,
        mission: {
          mission_id: missionId,
          prompt,
          status: "queued"
        }
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to create mission.";
    return errorResponse(500, message);
  }
}

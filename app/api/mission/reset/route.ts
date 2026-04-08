import { NextResponse } from "next/server";
import {
  createServerInsforgeClient,
  hasPreviewAccess,
  isSameOriginRequest,
  NO_STORE_HEADERS
} from "../../../lib/insforge-server";

export const dynamic = "force-dynamic";
const RESETTABLE_TABLES = [
  "logs",
  "discoveries",
  "signals",
  "control_commands",
  "builder_outputs",
  "agent_memory"
] as const;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function parseMissionId(body: unknown) {
  return typeof (body as { missionId?: unknown })?.missionId === "string" &&
    (body as { missionId: string }).missionId.trim()
    ? (body as { missionId: string }).missionId.trim()
    : null;
}

async function resolveMissionId(
  insforge: ReturnType<typeof createServerInsforgeClient>,
  missionId: string | null
) {
  if (missionId) {
    return missionId;
  }

  const latestMission = await insforge.database
    .from("missions")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);

  if (latestMission.error) {
    throw latestMission.error;
  }

  const latestRecord = latestMission.data?.[0] as { id?: unknown } | undefined;
  return typeof latestRecord?.id === "string" && latestRecord.id.trim() ? latestRecord.id : null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden_origin");
  }

  if (!(await hasPreviewAccess(request))) {
    return errorResponse(401, "unauthorized");
  }

  let missionId: string | null = null;
  try {
    missionId = parseMissionId(await request.json());
  } catch {
    return errorResponse(400, "invalid_json");
  }

  try {
    const insforge = createServerInsforgeClient();
    const targetMissionId = await resolveMissionId(insforge, missionId);
    if (!targetMissionId) {
      return NextResponse.json({ ok: true, missionId: null }, { headers: NO_STORE_HEADERS });
    }

    const stopCommand = await insforge.database.from("control_commands").insert([
      {
        mission_id: targetMissionId,
        command: "stop_all",
        payload: { source: "reset" },
        status: "pending"
      }
    ]);

    if (stopCommand.error) {
      throw stopCommand.error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));

    for (const table of RESETTABLE_TABLES) {
      const deleteResult = await insforge.database
        .from(table)
        .delete()
        .eq("mission_id", targetMissionId);
      if (deleteResult.error) {
        throw deleteResult.error;
      }
    }

    const agentReset = await insforge.database
      .from("agents")
      .update({
        status: "idle",
        current_url: "",
        assignment: "",
        energy: 100,
        session_id: null,
        preview_bucket: null,
        preview_key: null,
        preview_updated_at: null
      })
      .eq("mission_id", targetMissionId);

    if (agentReset.error) {
      throw agentReset.error;
    }

    const missionReset = await insforge.database
      .from("missions")
      .update({
        status: "stopped",
        stopped_at: new Date().toISOString(),
        refined_idea: null,
        final_options: null
      })
      .eq("id", targetMissionId);

    if (missionReset.error) {
      throw missionReset.error;
    }

    return NextResponse.json({ ok: true, missionId: targetMissionId }, { headers: NO_STORE_HEADERS });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to reset MasterBuild.";
    return errorResponse(500, message);
  }
}

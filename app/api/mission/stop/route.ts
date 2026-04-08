import { NextResponse } from "next/server";
import {
  createServerInsforgeClient,
  hasPreviewAccess,
  isSameOriginRequest,
  NO_STORE_HEADERS
} from "../../../lib/insforge-server";

export const dynamic = "force-dynamic";

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

    const commandResult = await insforge.database.from("control_commands").insert([
      {
        mission_id: targetMissionId,
        command: "stop_all",
        payload: { source: "ui" },
        status: "pending"
      }
    ]);

    if (commandResult.error) {
      throw commandResult.error;
    }

    const missionUpdate = await insforge.database
      .from("missions")
      .update({ status: "stopping" })
      .eq("id", targetMissionId);

    if (missionUpdate.error) {
      throw missionUpdate.error;
    }

    const agentUpdate = await insforge.database
      .from("agents")
      .update({ status: "stopped", energy: 0 })
      .eq("mission_id", targetMissionId);

    if (agentUpdate.error) {
      throw agentUpdate.error;
    }

    return NextResponse.json({ ok: true, missionId: targetMissionId }, { headers: NO_STORE_HEADERS });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to queue stop command.";
    return errorResponse(500, message);
  }
}

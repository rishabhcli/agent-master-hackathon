import { NextResponse } from "next/server";
import {
  createServerInsforgeClient,
  hasPreviewAccess,
  isSameOriginRequest,
  NO_STORE_HEADERS
} from "../../lib/insforge-server";

export const dynamic = "force-dynamic";

const MISSION_COLUMNS =
  "id,prompt,status,live_url_1,live_url_2,live_url_3,live_url_4,live_url_5,final_options";
const AGENT_COLUMNS = "id,agent_id,status,current_url,profile_path,energy";
const DISCOVERY_COLUMNS =
  "id,source_url,thumbnail_url,agent_id,keywords,likes,views,comments,created_at";
const LOG_COLUMNS = "id,agent_id,message,type,metadata,created_at";
const SIGNAL_COLUMNS = "id,from_agent,to_agent,message,signal_type,created_at";
const THOUGHT_COLUMNS =
  "id,agent_id,thought_type,prompt_summary,response_summary,action_taken,model,tokens_used,duration_ms,created_at";
const MEMORY_COLUMNS = "id,filename,content,version,updated_by,updated_at";
const BUSINESS_PLAN_COLUMNS =
  "id,version,market_opportunity,competitive_landscape,revenue_models,user_acquisition,risk_analysis,confidence_score,discovery_count,is_final,raw_plan,created_at";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden_origin");
  }

  if (!(await hasPreviewAccess(request))) {
    return errorResponse(401, "unauthorized");
  }

  try {
    const insforge = createServerInsforgeClient();
    const missionResult = await insforge.database
      .from("missions")
      .select(MISSION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (missionResult.error) {
      throw missionResult.error;
    }

    const missionId =
      missionResult.data &&
      typeof missionResult.data === "object" &&
      "id" in missionResult.data
        ? String((missionResult.data as { id: unknown }).id ?? "")
        : "";

    if (!missionId) {
      return NextResponse.json(
        {
          mission: null,
          agents: [],
          discoveries: [],
          logs: [],
          signals: [],
          thoughts: [],
          memory: [],
          businessPlans: []
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const [
      agentResult,
      discoveryResult,
      logResult,
      signalResult,
      thoughtsResult,
      memoryResult,
      businessPlanResult
    ] = await Promise.all([
      insforge.database.from("agents").select(AGENT_COLUMNS).eq("mission_id", missionId).order("agent_id", { ascending: true }),
      insforge.database
        .from("discoveries")
        .select(DISCOVERY_COLUMNS)
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(100),
      insforge.database
        .from("logs")
        .select(LOG_COLUMNS)
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(60),
      insforge.database
        .from("signals")
        .select(SIGNAL_COLUMNS)
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(60),
      insforge.database
        .from("agent_thoughts")
        .select(THOUGHT_COLUMNS)
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(100),
      insforge.database
        .from("agent_memory")
        .select(MEMORY_COLUMNS)
        .eq("mission_id", missionId)
        .order("filename", { ascending: true }),
      insforge.database
        .from("business_plans")
        .select(BUSINESS_PLAN_COLUMNS)
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    const firstError =
      agentResult.error ??
      discoveryResult.error ??
      logResult.error ??
      signalResult.error;

    if (firstError) {
      throw firstError;
    }

    return NextResponse.json(
      {
        mission: missionResult.data ?? null,
        agents: agentResult.data ?? [],
        discoveries: discoveryResult.data ?? [],
        logs: logResult.data ?? [],
        signals: signalResult.data ?? [],
        thoughts: thoughtsResult.error ? [] : thoughtsResult.data ?? [],
        memory: memoryResult.error ? [] : memoryResult.data ?? [],
        businessPlans: businessPlanResult.error ? [] : businessPlanResult.data ?? []
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to load MasterBuild dashboard.";
    return errorResponse(500, message);
  }
}

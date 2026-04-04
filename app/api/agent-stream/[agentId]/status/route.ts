import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { hasPreviewAccess } from "../../../../lib/insforge-server";
import { getAgentMetadataPath } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } }
) {
  if (!(await hasPreviewAccess())) {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  const agentId = Number(params.agentId);
  if (!Number.isFinite(agentId) || agentId < 1 || agentId > 9) {
    return NextResponse.json({ error: "invalid_agent_id" }, { status: 400 });
  }

  try {
    const raw = await fs.readFile(getAgentMetadataPath(agentId), "utf8");
    return NextResponse.json(JSON.parse(raw), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch {
    return NextResponse.json(
      {
        agentId,
        status: "idle",
        title: "Waiting for local browser session",
        currentUrl: "",
        updatedAt: null,
        heartbeatAt: null,
        note: "The local worker has not written preview metadata yet."
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }
}

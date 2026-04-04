import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAgentFramePath } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

function placeholderSvg(agentId: number) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#020408" />
          <stop offset="100%" stop-color="#08111f" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <circle cx="640" cy="290" r="120" fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.45)" />
      <text x="640" y="318" text-anchor="middle" fill="#22d3ee" font-size="44" font-family="monospace">AGENT ${agentId}</text>
      <text x="640" y="378" text-anchor="middle" fill="#94a3b8" font-size="24" font-family="monospace">Waiting for local preview frame</text>
    </svg>
  `.trim();
}

export async function GET(
  _request: Request,
  { params }: { params: { agentId: string } }
) {
  const agentId = Number(params.agentId);
  if (!Number.isFinite(agentId) || agentId < 1 || agentId > 9) {
    return new NextResponse("Invalid agent id", { status: 400 });
  }

  try {
    const bytes = await fs.readFile(getAgentFramePath(agentId));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch {
    return new NextResponse(placeholderSvg(agentId), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }
}

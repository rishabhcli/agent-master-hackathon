import { NextResponse } from "next/server";
import {
  createServerInsforgeClient,
  isSameOriginRequest,
  NO_STORE_HEADERS
} from "../../../lib/insforge-server";
import { MASTERBUILD_PREVIEW_ACCESS_COOKIE } from "../../../lib/previewAccess";

export const dynamic = "force-dynamic";

const ONE_HOUR_SECONDS = 60 * 60;

function buildCookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: ONE_HOUR_SECONDS
  };
}

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden_origin");
  }

  let accessToken = "";
  try {
    const body = await request.json();
    accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  } catch {
    return errorResponse(400, "invalid_json");
  }

  if (!accessToken) {
    return errorResponse(400, "access_token_required");
  }

  try {
    const client = createServerInsforgeClient(accessToken);
    const result = await client.auth.getCurrentUser();
    if (result.error || !result.data?.user) {
      return errorResponse(401, "invalid_access_token");
    }
  } catch {
    return errorResponse(401, "invalid_access_token");
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(MASTERBUILD_PREVIEW_ACCESS_COOKIE, accessToken, buildCookieOptions(request));
  return response;
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden_origin");
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(MASTERBUILD_PREVIEW_ACCESS_COOKIE, "", {
    ...buildCookieOptions(request),
    maxAge: 0
  });
  return response;
}

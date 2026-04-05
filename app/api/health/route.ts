import { NextResponse } from "next/server";

const APP_VERSION = process.env.npm_package_version ?? "1.0.0";

export async function GET() {
  const timestamp = new Date().toISOString();

  const insforgeUrl =
    process.env.MASTERBUILD_INSFORGE_URL ??
    process.env.NEXT_PUBLIC_INSFORGE_URL;

  let backendReachable = false;
  if (insforgeUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${insforgeUrl}/api/database/records/missions?limit=0`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? ""}`,
        },
      });
      clearTimeout(timeout);
      backendReachable = response.ok || response.status === 401;
    } catch {
      backendReachable = false;
    }
  }

  const status = backendReachable ? "ok" : "degraded";
  const statusCode = backendReachable ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: APP_VERSION,
      timestamp,
      checks: {
        insforge: backendReachable ? "reachable" : "unreachable",
      },
    },
    { status: statusCode }
  );
}

import "server-only";

import { createClient } from "@insforge/sdk";
import { cookies } from "next/headers";
import { MASTERBUILD_PREVIEW_ACCESS_COOKIE } from "./previewAccess";

const DEFAULT_BASE_URL = "https://qnm7e5sc.us-west.insforge.app";
const PREVIEW_AUTH_BYPASS_ENV =
  process.env.MASTERBUILD_SKIP_PREVIEW_AUTH || process.env.MASTERBUILD_BYPASS_PREVIEW_AUTH;

function isPreviewAuthBypassed(request?: Request) {
  const normalized = (PREVIEW_AUTH_BYPASS_ENV ?? "").toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }

  if (process.env.NODE_ENV === "production" || !request) {
    return false;
  }

  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

function getServerInsforgeClient(accessToken: string) {
  return createClient({
    baseUrl:
      process.env.MASTERBUILD_INSFORGE_URL ??
      process.env.NEXT_PUBLIC_INSFORGE_URL ??
      DEFAULT_BASE_URL,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? "",
    isServerMode: true,
    edgeFunctionToken: accessToken
  });
}

export async function hasPreviewAccess(request?: Request) {
  if (isPreviewAuthBypassed(request)) {
    return true;
  }

  const accessToken = cookies().get(MASTERBUILD_PREVIEW_ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return false;
  }

  const client = getServerInsforgeClient(accessToken);
  const result = await client.auth.getCurrentUser();
  return Boolean(result.data?.user && !result.error);
}

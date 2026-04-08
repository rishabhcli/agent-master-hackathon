import "server-only";

import { createClient } from "@insforge/sdk";
import { cookies } from "next/headers";
import { MASTERBUILD_PREVIEW_ACCESS_COOKIE } from "./previewAccess";

const DEFAULT_BASE_URL = "";
const PREVIEW_AUTH_BYPASS_ENV =
  process.env.MASTERBUILD_SKIP_PREVIEW_AUTH || process.env.MASTERBUILD_BYPASS_PREVIEW_AUTH;
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
} as const;

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

function getStoredPreviewAccessToken() {
  return cookies().get(MASTERBUILD_PREVIEW_ACCESS_COOKIE)?.value ?? null;
}

export function createServerInsforgeClient(accessToken?: string) {
  const resolvedAccessToken = accessToken ?? getStoredPreviewAccessToken();
  const baseUrl =
    process.env.MASTERBUILD_INSFORGE_URL ??
    process.env.NEXT_PUBLIC_INSFORGE_URL ??
    DEFAULT_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing MASTERBUILD_INSFORGE_URL or NEXT_PUBLIC_INSFORGE_URL");
  }
  if (!resolvedAccessToken) {
    throw new Error("Missing preview access token");
  }
  return createClient({
    baseUrl,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? "",
    isServerMode: true,
    edgeFunctionToken: resolvedAccessToken
  });
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function hasPreviewAccess(request?: Request) {
  if (isPreviewAuthBypassed(request)) {
    return true;
  }

  const accessToken = getStoredPreviewAccessToken();
  if (!accessToken) {
    return false;
  }

  const client = createServerInsforgeClient(accessToken);
  const result = await client.auth.getCurrentUser();
  return Boolean(result.data?.user && !result.error);
}

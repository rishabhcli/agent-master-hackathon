"use client";

import { createClient } from "@insforge/sdk";

const INSFORGE_CSRF_COOKIE = "insforge_csrf_token";
const PREVIEW_AUTH_BYPASS_ENV =
  process.env.NEXT_PUBLIC_MASTERBUILD_SKIP_PREVIEW_AUTH || process.env.NEXT_PUBLIC_MASTERBUILD_BYPASS_PREVIEW_AUTH;

function isDevBypassEnabled() {
  const normalized = (PREVIEW_AUTH_BYPASS_ENV ?? "").toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }

  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".local"))
  );
}

export function isPreviewAuthBypassed() {
  return isDevBypassEnabled();
}

export const INSFORGE_BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL ?? "";

export const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? "";

export const hasInsforgeConfig = Boolean(INSFORGE_BASE_URL && INSFORGE_ANON_KEY);

export function getInsforgeConfigError() {
  if (!INSFORGE_BASE_URL) {
    return "Missing `NEXT_PUBLIC_INSFORGE_URL`. Set your InsForge backend URL before launching MasterBuild.";
  }
  if (!INSFORGE_ANON_KEY) {
    return "Missing `NEXT_PUBLIC_INSFORGE_ANON_KEY`. Configure the InsForge anon token before launching MasterBuild.";
  }

  return null;
}

export const insforge = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY
});

function getAccessTokenFromHeaders() {
  const headers = insforge.getHttpClient().getHeaders();
  const authorizationEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "authorization"
  );
  const authorization = authorizationEntry?.[1] ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

export function primeInsforgeAccessTokenFromCookie() {
  return null;
}

async function updatePreviewAccessTokenCookie(method: "POST" | "DELETE", accessToken?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    await fetch("/api/auth/preview-session", {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      cache: "no-store",
      body: method === "POST" ? JSON.stringify({ accessToken }) : undefined
    });
  } catch {
    // Best-effort sync. Client auth still works even if the preview relay cookie update fails.
  }
}

export async function syncPreviewAccessTokenCookie() {
  const token = getAccessTokenFromHeaders();
  if (!token) {
    await updatePreviewAccessTokenCookie("DELETE");
    return;
  }

  await updatePreviewAccessTokenCookie("POST", token);
}

export async function clearPreviewAccessTokenCookie() {
  await updatePreviewAccessTokenCookie("DELETE");
}

export function isUnsignedSessionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeMessage = "message" in error ? String(error.message ?? "") : "";
  const maybeCode = "error" in error ? String(error.error ?? "") : "";
  return (
    maybeMessage.toLowerCase().includes("no refresh token provided") ||
    maybeCode.toLowerCase().includes("refresh_token_required")
  );
}

export function shouldBootstrapInsforgeSession() {
  if (isPreviewAuthBypassed()) {
    return true;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const search = window.location.search;
  if (search.includes("insforge_code=") || search.includes("insforge_status=")) {
    return true;
  }

  return (
    document.cookie.includes(`${INSFORGE_CSRF_COOKIE}=`)
  );
}

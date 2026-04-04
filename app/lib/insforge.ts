"use client";

import { createClient } from "@insforge/sdk";
import { MASTERBUILD_PREVIEW_ACCESS_COOKIE } from "./previewAccess";

const INSFORGE_CSRF_COOKIE = "insforge_csrf_token";

export const INSFORGE_BASE_URL =
  process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://qnm7e5sc.us-west.insforge.app";

export const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? "";

export const hasInsforgeConfig = Boolean(INSFORGE_BASE_URL && INSFORGE_ANON_KEY);

export function getInsforgeConfigError() {
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

function getAccessTokenFromCookie() {
  if (typeof document === "undefined") {
    return null;
  }

  const entry = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=`));

  if (!entry) {
    return null;
  }

  const rawValue = entry.slice(`${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=`.length);
  return rawValue ? decodeURIComponent(rawValue) : null;
}

export function primeInsforgeAccessTokenFromCookie() {
  const token = getAccessTokenFromCookie();
  insforge.getHttpClient().setAuthToken(token);
  return token;
}

export function syncPreviewAccessTokenCookie() {
  if (typeof document === "undefined") {
    return;
  }

  const token = getAccessTokenFromHeaders();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  if (!token) {
    document.cookie = `${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
    return;
  }

  document.cookie = `${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=${encodeURIComponent(
    token
  )}; path=/; SameSite=Lax${secure}`;
}

export function clearPreviewAccessTokenCookie() {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
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
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const search = window.location.search;
  if (search.includes("insforge_code=") || search.includes("insforge_status=")) {
    return true;
  }

  return (
    document.cookie.includes(`${INSFORGE_CSRF_COOKIE}=`) ||
    document.cookie.includes(`${MASTERBUILD_PREVIEW_ACCESS_COOKIE}=`)
  );
}

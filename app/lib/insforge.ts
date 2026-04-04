"use client";

import { createClient } from "@insforge/sdk";

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

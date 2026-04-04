import "server-only";

import { createClient } from "@insforge/sdk";
import { cookies } from "next/headers";
import { MASTERBUILD_PREVIEW_ACCESS_COOKIE } from "./previewAccess";

const DEFAULT_BASE_URL = "https://qnm7e5sc.us-west.insforge.app";

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

export async function hasPreviewAccess() {
  const accessToken = cookies().get(MASTERBUILD_PREVIEW_ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return false;
  }

  const client = getServerInsforgeClient(accessToken);
  const result = await client.auth.getCurrentUser();
  return Boolean(result.data?.user && !result.error);
}

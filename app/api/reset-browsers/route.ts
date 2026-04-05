import { exec } from "child_process";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST() {
  const results: string[] = [];

  // 1. Kill all Chromium/Chrome processes spawned by browser-use (not Electron apps)
  try {
    await new Promise<void>((resolve) => {
      exec(
        "pkill -f 'chromium.*--user-data-dir=.*runtime/browser' 2>/dev/null; pkill -f 'chrome.*--user-data-dir=.*runtime/browser' 2>/dev/null",
        () => resolve()
      );
    });
    results.push("Killed browser-use Chrome processes");
  } catch {
    results.push("No browser-use Chrome processes found");
  }

  // 2. Clear preview screenshots
  const previewsDir = path.resolve("runtime/previews");
  try {
    const agentDirs = await fs.readdir(previewsDir).catch(() => []);
    for (const dir of agentDirs) {
      const agentDir = path.join(previewsDir, dir);
      const stat = await fs.stat(agentDir).catch(() => null);
      if (stat?.isDirectory()) {
        const files = await fs.readdir(agentDir).catch(() => []);
        for (const file of files) {
          await fs.unlink(path.join(agentDir, file)).catch(() => {});
        }
      }
    }
    results.push("Cleared preview screenshots");
  } catch {
    results.push("Preview directory not found");
  }

  // 3. Clear browser profiles (except agent-2 which has X login)
  const browserDir = path.resolve("runtime/browser");
  try {
    const dirs = await fs.readdir(browserDir).catch(() => []);
    for (const dir of dirs) {
      if (dir === "agent-2") continue; // Preserve X login
      const fullPath = path.join(browserDir, dir);
      await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(fullPath, { recursive: true }).catch(() => {});
    }
    results.push("Cleared browser profiles (preserved agent-2 X login)");
  } catch {
    results.push("Browser directory not found");
  }

  return NextResponse.json({ ok: true, results });
}

/**
 * Full-flow Playwright automation for MasterBuild.
 *
 * Run: npx tsx run_full_flow.ts
 */

import { chromium } from "playwright";
import { spawn, execSync } from "child_process";

const APP_URL = process.env.MASTERBUILD_APP_URL ?? "http://localhost:3000";
const MISSION_PROMPT = "Find an effective business plan for selling used trucks";
const CWD = process.cwd();

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Export the dashboard credentials before running this script.`
    );
  }
  return value;
}

async function main() {
  const testEmail = getRequiredEnv("MASTERBUILD_TEST_EMAIL");
  const testPassword = getRequiredEnv("MASTERBUILD_TEST_PASSWORD");
  console.log("[flow] Launching visible Chrome browser for dashboard...");

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // ── Step 1: Navigate to the app ──
  console.log("[flow] Opening dashboard at", APP_URL);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Take initial screenshot
  await page.screenshot({ path: "runtime/previews/flow-01-initial.png" });
  console.log("[flow] Screenshot: flow-01-initial.png");

  // ── Step 2: Handle auth ──
  const emailField = page.locator('input[type="email"]');
  const hasAuthForm = await emailField.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasAuthForm) {
    console.log("[flow] Auth form detected — filling credentials...");
    await emailField.fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);
    await page.screenshot({ path: "runtime/previews/flow-02-auth-filled.png" });

    // Submit form
    await page.locator('button[type="submit"]').click();
    console.log("[flow] Sign-in submitted...");

    // Wait for either dashboard or error
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "runtime/previews/flow-03-after-signin.png" });

    // Check if sign-in worked by looking for the mission input
    const dashboardLoaded = await page.locator('input[placeholder*="mission" i]').isVisible({ timeout: 10000 }).catch(() => false);
    if (!dashboardLoaded) {
      // Check for errors
      const pageText = await page.textContent("body").catch(() => "");
      console.log("[flow] Dashboard not loaded. Page text snippet:", pageText?.slice(0, 300));

      // Try OAuth with Google if email/password didn't work
      const googleBtn = page.locator('button:has-text("Google")');
      if (await googleBtn.isVisible().catch(() => false)) {
        console.log("[flow] Trying Google OAuth...");
        await googleBtn.click();
        await page.waitForTimeout(8000);
        await page.screenshot({ path: "runtime/previews/flow-03b-oauth.png" });
      }
    } else {
      console.log("[flow] Dashboard loaded successfully after sign-in!");
    }
  } else {
    console.log("[flow] No auth form — checking if already on dashboard...");
  }

  // ── Step 3: Wait for dashboard ──
  const missionInput = page.locator('input[placeholder*="mission" i], input[placeholder*="Mission" i]');
  const ready = await missionInput.isVisible({ timeout: 15000 }).catch(() => false);

  if (!ready) {
    await page.screenshot({ path: "runtime/previews/flow-04-stuck.png" });
    const text = await page.textContent("body").catch(() => "empty");
    console.log("[flow] Cannot find mission input. Current page:", text?.slice(0, 500));
    console.log("[flow] Check screenshots in runtime/previews/ for details.");
    console.log("[flow] You may need to sign in manually at", APP_URL);

    // Keep browser open for manual intervention
    console.log("[flow] Keeping browser open for 5 minutes for manual sign-in...");
    console.log("[flow] Once signed in, the script will continue automatically.");

    // Poll until mission input appears
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      if (await missionInput.isVisible().catch(() => false)) {
        console.log("[flow] Dashboard now ready!");
        break;
      }
      if (i === 59) {
        console.log("[flow] Timed out waiting for dashboard. Exiting.");
        await browser.close();
        process.exit(1);
      }
    }
  }

  // ── Step 4: Stop any existing mission ──
  const stopBtn = page.locator('button:has-text("Stop All")');
  if (await stopBtn.isVisible().catch(() => false)) {
    console.log("[flow] Stopping existing mission...");
    await stopBtn.click();
    await page.waitForTimeout(3000);
  }

  // ── Step 5: Create the mission ──
  console.log(`[flow] Creating mission: "${MISSION_PROMPT}"`);
  await missionInput.click();
  await missionInput.fill(MISSION_PROMPT);
  await page.waitForTimeout(500);

  const launchBtn = page.locator('button:has-text("Launch Mission"), button:has-text("New Mission")').first();
  await launchBtn.click();
  console.log("[flow] Mission launched!");
  await page.screenshot({ path: "runtime/previews/flow-05-mission-created.png" });
  await page.waitForTimeout(2000);

  // ── Step 6: Start the Python orchestrator ──
  console.log("[flow] Starting Python orchestrator with VISIBLE Chrome windows...");

  // Kill any lingering orchestrator processes
  try { execSync("pkill -f 'python.*orchestrator' 2>/dev/null"); } catch {}
  await new Promise(r => setTimeout(r, 1000));

  const orchestrator = spawn("bash", ["-lc", [
    `cd "${CWD}"`,
    "source .venv/bin/activate",
    "export MASTERBUILD_HEADLESS=false",
    "PYTHONUNBUFFERED=1 exec python3 orchestrator.py",
  ].join(" && ")], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MASTERBUILD_HEADLESS: "false",
      PYTHONUNBUFFERED: "1",
    },
    detached: false,
  });

  let orchestratorStarted = false;

  orchestrator.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      console.log(`[orch] ${line}`);
      if (line.includes("Mission activated") || line.includes("starting with browser-use")) {
        orchestratorStarted = true;
      }
    }
  });

  orchestrator.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      console.log(`[orch:err] ${line}`);
    }
  });

  orchestrator.on("exit", (code) => {
    console.log(`[orch] Process exited with code ${code}`);
  });

  // ── Step 7: Monitor for 10 minutes ──
  console.log("[flow] Monitoring for agent activity (10 min max)...");
  console.log("[flow] You should see 4 Chrome windows open for YouTube, X, Reddit, Substack.");

  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(5000);

    // Refresh the page periodically to get latest data
    if (i > 0 && i % 12 === 0) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    }

    // Check active count
    const activeText = await page.locator('text=/\\d+ ACTIVE/').textContent().catch(() => "? ACTIVE");
    const searchingCount = await page.locator('text=/SEARCHING/i').count().catch(() => 0);
    const logEntries = await page.locator('div:has-text("Browsing:")').count().catch(() => 0);

    console.log(`[flow] ${Math.floor((i * 5) / 60)}m${(i * 5) % 60}s | ${activeText} | ${searchingCount} searching | ${logEntries} browse logs`);

    // Screenshot every minute
    if (i % 12 === 0 && i > 0) {
      const ts = Math.floor(Date.now() / 1000);
      await page.screenshot({ path: `runtime/previews/flow-monitor-${ts}.png` });
    }

    // Success criteria: at least 1 agent searching
    if (searchingCount > 0 && !orchestratorStarted) {
      orchestratorStarted = true;
      console.log("[flow] Agents are actively browsing the correct platforms!");
    }
  }

  console.log("[flow] Monitoring complete. Stopping orchestrator...");
  orchestrator.kill("SIGTERM");

  // Keep dashboard open for review
  console.log("[flow] Dashboard browser staying open for review. Close manually when done.");
  await page.waitForTimeout(60000);
  await browser.close();
}

main().catch((err) => {
  console.error("[flow] Fatal error:", err.message || err);
  process.exit(1);
});

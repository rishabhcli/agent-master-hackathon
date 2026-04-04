/**
 * Log into X (Twitter) using Playwright with the agent-2 browser profile.
 * This saves cookies so the orchestrator's agent-2 starts logged in.
 *
 * Run: npx tsx login_x.ts
 */
import { chromium } from "playwright";
import path from "path";

const PROFILE_DIR = path.resolve("runtime/browser/agent-2");
const X_USERNAME = "rb8dg";
const X_PASSWORD = "ceNnov-baznez-8vywfo";

async function main() {
  console.log("[login-x] Launching Chrome with agent-2 profile...");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  // Navigate to X login
  console.log("[login-x] Navigating to x.com/login...");
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "runtime/previews/x-login-01.png" });

  // Enter username
  console.log("[login-x] Entering username...");
  const usernameInput = page.locator('input[autocomplete="username"], input[name="text"]').first();
  await usernameInput.waitFor({ state: "visible", timeout: 15000 });
  await usernameInput.fill(X_USERNAME);
  await page.waitForTimeout(500);

  // Click Next
  const nextButton = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
  await nextButton.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "runtime/previews/x-login-02.png" });

  // Check for unusual activity / phone verification prompt
  const unusualActivity = await page.locator('text=/unusual/i, text=/verify/i, text=/phone/i, text=/email/i').first().isVisible({ timeout: 3000 }).catch(() => false);
  if (unusualActivity) {
    console.log("[login-x] Verification prompt detected — check the browser window.");
    // Try to handle email/username verification
    const verifyInput = page.locator('input[data-testid="ocfEnterTextTextInput"], input[name="text"]').first();
    if (await verifyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("[login-x] Entering username for verification...");
      await verifyInput.fill(X_USERNAME);
      const verifyNext = page.locator('button:has-text("Next"), div[data-testid="ocfEnterTextNextButton"]').first();
      await verifyNext.click();
      await page.waitForTimeout(3000);
    }
  }

  // Enter password
  console.log("[login-x] Entering password...");
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.fill(X_PASSWORD);
  await page.waitForTimeout(500);

  // Click Log in
  const loginButton = page.locator('button[data-testid="LoginForm_Login_Button"], button:has-text("Log in"), div[role="button"]:has-text("Log in")').first();
  await loginButton.click();
  console.log("[login-x] Login submitted...");
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "runtime/previews/x-login-03.png" });

  // Check if we landed on the home feed
  const homeUrl = page.url();
  console.log("[login-x] Current URL:", homeUrl);

  if (homeUrl.includes("x.com/home") || homeUrl === "https://x.com/") {
    console.log("[login-x] Successfully logged into X!");
  } else {
    console.log("[login-x] May need manual verification. Browser staying open for 60s...");
    console.log("[login-x] Complete any verification in the browser window, then close it.");
    await page.waitForTimeout(60000);
  }

  // Final screenshot
  await page.screenshot({ path: "runtime/previews/x-login-final.png" });
  console.log("[login-x] Closing browser — cookies saved to agent-2 profile.");
  await context.close();
}

main().catch((err) => {
  console.error("[login-x] Error:", err.message);
  process.exit(1);
});

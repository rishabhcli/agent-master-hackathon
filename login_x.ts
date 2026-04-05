/**
 * Log into X (Twitter) using Playwright with the agent-2 browser profile.
 * This saves cookies so the orchestrator's agent-2 starts logged in.
 *
 * Run: npx tsx login_x.ts
 * Env: X_USERNAME and X_PASSWORD must be set in .env or .env.local.
 */
import { loadEnvConfig } from "@next/env";
import { chromium } from "playwright";
import path from "path";

loadEnvConfig(process.cwd());

const PROFILE_DIR = path.resolve("runtime/browser/agent-2");

function getRequiredEnv(name: "X_USERNAME" | "X_PASSWORD") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[login-x] Missing ${name}. Set it in .env or .env.local before running.`);
  }
  return value;
}

/** Type into an input character-by-character with random delays to look human. */
async function humanType(page: any, selector: string, text: string) {
  const el = page.locator(selector).first();
  await el.click();
  for (const char of text) {
    await el.press(char === " " ? "Space" : char, { delay: 40 + Math.random() * 80 });
  }
}

async function main() {
  const xUsername = getRequiredEnv("X_USERNAME");
  const xPassword = getRequiredEnv("X_PASSWORD");

  console.log("[login-x] Launching Chrome with agent-2 profile (visible)...");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  // ── Step 1: Navigate to X login ────────────────────────────
  console.log("[login-x] Navigating to x.com/login...");
  await page.goto("https://x.com/i/flow/login", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "runtime/previews/x-login-01-landing.png" });

  // ── Step 2: Enter username ─────────────────────────────────
  console.log("[login-x] Waiting for username input...");
  // X login uses input[autocomplete="username"] or input[name="text"]
  const usernameSelector = 'input[autocomplete="username"], input[name="text"]';
  await page.locator(usernameSelector).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);

  console.log("[login-x] Typing username...");
  await humanType(page, usernameSelector, xUsername);
  await page.waitForTimeout(400);

  // ── Step 3: Click "Next" ───────────────────────────────────
  console.log("[login-x] Clicking Next...");
  // Use the specific test-id button first, fall back to text match
  const nextBtn = page.locator(
    'button[type="button"]:has-text("Next"), div[role="button"]:has-text("Next")'
  ).first();
  await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
  await nextBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "runtime/previews/x-login-03-after-next.png" });

  // ── Step 4: Handle verification challenge ──────────────────
  // X sometimes asks "Enter your phone number or username" as a security check.
  // IMPORTANT: Do NOT click "Forgot password?" or any reset link.
  const verifyInput = page.locator(
    'input[data-testid="ocfEnterTextTextInput"]'
  );
  const isVerifyVisible = await verifyInput
    .isVisible({ timeout: 4000 })
    .catch(() => false);

  if (isVerifyVisible) {
    console.log("[login-x] Verification prompt detected — entering username...");
    await verifyInput.click();
    await verifyInput.fill("");
    await page.waitForTimeout(200);
    await humanType(page, 'input[data-testid="ocfEnterTextTextInput"]', xUsername);
    await page.waitForTimeout(400);

    // Click the "Next" button on the verification screen
    const verifyNextBtn = page.locator(
      'button[data-testid="ocfEnterTextNextButton"], button:has-text("Next")'
    ).first();
    await verifyNextBtn.click();
    console.log("[login-x] Verification username submitted.");
    await page.waitForTimeout(3000);
  } else {
    console.log("[login-x] No verification prompt — proceeding to password.");
  }

  // ── Step 5: Enter password ─────────────────────────────────
  console.log("[login-x] Waiting for password input...");
  const pwdSelector = 'input[name="password"], input[type="password"]';
  await page.locator(pwdSelector).first().waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(300);

  console.log("[login-x] Typing password...");
  await humanType(page, pwdSelector, xPassword);
  await page.waitForTimeout(400);

  // ── Step 6: Click "Log in" ─────────────────────────────────
  console.log("[login-x] Clicking Log in...");
  const loginBtn = page.locator(
    'button[data-testid="LoginForm_Login_Button"]'
  ).first();
  await loginBtn.waitFor({ state: "visible", timeout: 10_000 });
  await loginBtn.click();
  console.log("[login-x] Login button clicked — waiting for redirect...");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "runtime/previews/x-login-06-after-login.png" });

  // ── Step 7: Verify success ─────────────────────────────────
  const finalUrl = page.url();
  console.log("[login-x] Current URL:", finalUrl);

  if (finalUrl.includes("/home") || finalUrl === "https://x.com/" || finalUrl === "https://x.com") {
    console.log("[login-x] ✅ Successfully logged into X! Cookies saved to agent-2 profile.");
  } else {
    console.log("[login-x] ⚠️  Not on home feed yet. URL:", finalUrl);
    console.log("[login-x] Browser will stay open for 90s — complete any remaining steps manually.");
    await page.waitForTimeout(90_000);
  }

  await page.screenshot({ path: "runtime/previews/x-login-final.png" });
  console.log("[login-x] Closing browser — session persisted.");
  await context.close();
}

main().catch((err) => {
  console.error("[login-x] Fatal error:", err.message);
  process.exit(1);
});

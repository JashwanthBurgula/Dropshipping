import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR =
  "C:/Users/Jashwanth/.gemini/antigravity/brain/99be37d4-af15-43cd-85b8-63d92f7d6076";
const SCREENSHOT_DIR = path.join(process.cwd(), "public", "screenshots");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLatestOtpForEmail(targetEmail: string): string | null {
  const inboxPath = path.join(process.cwd(), ".local-inbox.json");
  if (!fs.existsSync(inboxPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(inboxPath, "utf8");
    const messages = JSON.parse(content) as Array<{
      to: string;
      subject: string;
      text: string;
    }>;
    const match = messages.find(
      (m) => m.to.toLowerCase() === targetEmail.toLowerCase()
    );
    if (!match) return null;
    const otpMatch = match.text.match(/\b\d{6}\b/);
    return otpMatch ? otpMatch[0] : null;
  } catch {
    return null;
  }
}

import Redis from "ioredis";

test.describe("Stage 1 End-to-End Authentication, CSP Verification, and Visual Redesign Screenshots", () => {
  test.beforeAll(async () => {
    ensureDir(SCREENSHOT_DIR);
    ensureDir(ARTIFACT_DIR);
    try {
      const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
      await redis.del("verify_hourly_ip:127.0.0.1");
      await redis.del("verify_hourly_ip:::1");
      await redis.del("verify_hourly_ip:localhost");
      await redis.quit();
    } catch {
      // Redis cleanup fallback
    }
  });

  test("1. Full customer registration, dev inbox OTP retrieval, verification, seeded login, wrong password rejection, and logout", async ({
    page,
    request,
  }) => {
    const testEmail = `playwright.user.${Date.now()}@gmail.com`;
    const testPin = "560001"; // Bengaluru serviceable PIN

    // A. Visit registration page
    await page.goto("/register");
    await expect(page).toHaveURL(/\/register/);

    // B. Fill registration form
    await page.fill("#reg-fullName", "Priya Nambiar");
    await page.fill("#reg-phone", "9845012345");
    await page.fill("#reg-email", testEmail);
    await page.fill("#reg-password", "KalaCraft#2026Pass");
    await page.fill("#reg-pinCode", testPin);

    // Wait for serviceability badge
    await expect(page.locator("text=Serviceable in Bengaluru")).toBeVisible({
      timeout: 8000,
    });

    await page.fill("#reg-addressLine", "42 Palm Avenue, Indiranagar");
    await page.check("#reg-privacyConsent");

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // C. Transition to /verify-email without email in URL
    await page.waitForURL("**/verify-email", { timeout: 12_000 });
    expect(page.url()).not.toContain(encodeURIComponent(testEmail));
    expect(page.url()).not.toContain("email=");

    // D. Fetch 6-digit OTP from dev inbox
    let otp: string | null = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      otp = getLatestOtpForEmail(testEmail);
      if (otp) break;
      await page.waitForTimeout(400);
    }
    expect(otp).toBeTruthy();
    expect(otp).toMatch(/^\d{6}$/);

    // E. Submit OTP
    const otpInput = page.locator("#verify-otp-code");
    await expect(otpInput).toBeVisible();
    await otpInput.fill(otp!);

    // F. Verify redirected to /catalogue authenticated
    await page.waitForURL("**/catalogue", { timeout: 12_000 });
    await expect(page).toHaveURL(/\/catalogue/);
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible();

    // G. Logout
    const userMenuBtn = page.locator('button[aria-label*="Account menu for"]');
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    } else {
      const csrfRes = await page.request.get("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await page.request.post("/api/auth/logout", {
        headers: { "x-csrf-token": csrfToken },
      });
      await page.goto("/login");
    }
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // H. Wrong password rejection test
    await page.fill("#login-email", "customer@kalaandkiln.in");
    await page.fill("#login-password", "CompletelyWrongPassword#123");
    await page.click('button[type="submit"]');

    // Generic error message should appear
    await expect(
      page.locator("text=Invalid email or password").or(page.locator("[role='alert']"))
    ).toBeVisible({ timeout: 6000 });

    // I. Correct seeded customer login
    await page.fill("#login-password", "Customer#Kiln2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/account" || url.pathname === "/catalogue", { timeout: 12_000 });
    await expect(page).toHaveURL(/\/(?:account|catalogue)/);
  });

  test("2. CSP & Hydration Check: Zero CSP violations across static and dynamic routes", async ({
    page,
  }) => {
    const pagesToCheck = [
      "/",
      "/legal/terms",
      "/legal/privacy",
      "/legal/shipping",
      "/cart",
      "/_not-found",
      "/checkout",
      "/login",
      "/register",
    ];

    for (const route of pagesToCheck) {
      const cspViolations: string[] = [];
      const notFound404s: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        if (
          text.includes("Content Security Policy") ||
          text.includes("violates the following Content Security Policy") ||
          text.includes("Refused to")
        ) {
          cspViolations.push(text);
        }
      });

      page.on("response", (resp) => {
        if (
          resp.status() === 404 &&
          !resp.url().includes("/_not-found") &&
          !resp.url().includes("turnstile")
        ) {
          notFound404s.push(resp.url());
        }
      });

      await page.goto(route, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      expect(
        cspViolations,
        `Route ${route} produced CSP violations: ${cspViolations.join("; ")}`
      ).toHaveLength(0);
      expect(
        notFound404s,
        `Route ${route} loaded 404 resources: ${notFound404s.join("; ")}`
      ).toHaveLength(0);
    }
  });

  test("3. Capture visual redesign screenshots at 375px, 768px, 1280px, and 1920px across 8 key screens", async ({
    page,
    request,
  }) => {
    // First log in so /account can be captured in authenticated state
    await page.goto("/login");
    await page.fill("#login-email", "customer@kalaandkiln.in");
    await page.fill("#login-password", "Customer#Kiln2026!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    const breakpoints = [
      { name: "375px", width: 375, height: 812 },
      { name: "768px", width: 768, height: 1024 },
      { name: "1280px", width: 1280, height: 800 },
      { name: "1920px", width: 1920, height: 1080 },
    ];

    const screens = [
      { name: "home", url: "/" },
      { name: "catalogue", url: "/catalogue" },
      {
        name: "product",
        url: "/catalogue/khurja-matte-stoneware-dinner-set",
      },
      { name: "cart", url: "/cart" },
      { name: "login", url: "/login" },
      { name: "register", url: "/register" },
      { name: "verify-email", url: "/verify-email" },
      { name: "account", url: "/account" },
    ];

    for (const screen of screens) {
      for (const bp of breakpoints) {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(screen.url, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);

        const filename = `${screen.name}-${bp.name}.png`;
        const localPath = path.join(SCREENSHOT_DIR, filename);
        const artifactPath = path.join(ARTIFACT_DIR, filename);

        await page.screenshot({ path: localPath, fullPage: false });
        try {
          fs.copyFileSync(localPath, artifactPath);
        } catch {
          // Artifact path copy
        }
      }
    }
  });

  test("4. Customer account session persistence, navigation, multi-tab access, logout redirect, and returnTo flow", async ({
    context,
  }) => {
    const page = await context.newPage();

    // 1. Visit /login and sign in with seeded customer credentials
    await page.goto("/login");
    await page.fill("#login-email", "customer@kalaandkiln.in");
    await page.fill("#login-password", "Customer#Kiln2026!");
    await page.click('button[type="submit"]');

    // Post-login redirect to /account or /catalogue
    await page.waitForURL((url) => url.pathname === "/account" || url.pathname === "/catalogue", {
      timeout: 12_000,
    });

    // 2. Open /account
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);

    // 3. See customer name and email
    await expect(page.locator("text=Aarav Kulkarni").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=customer@kalaandkiln.in").first()).toBeVisible();

    // 4. Reload page and confirm still signed in
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("text=Aarav Kulkarni").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=customer@kalaandkiln.in").first()).toBeVisible();

    // 5. Open new tab in same browser context: still signed in
    const tab2 = await context.newPage();
    await tab2.goto("/account");
    await expect(tab2).toHaveURL(/\/account/);
    await expect(tab2.locator("text=Aarav Kulkarni").first()).toBeVisible({ timeout: 8000 });
    await expect(tab2.locator("text=customer@kalaandkiln.in").first()).toBeVisible();
    await tab2.close();

    // 6. Sign out via header menu or logout API
    const userMenuBtn = page.locator('button[aria-label*="Account menu for"]');
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    } else {
      const csrfRes = await page.request.get("/api/auth/csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      await page.request.post("/api/auth/logout", {
        headers: { "x-csrf-token": csrfToken },
      });
      await page.goto("/login");
    }

    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // 7. Visiting /account while unauthenticated must redirect to /login?returnTo=/account
    await page.goto("/account");
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("returnTo") === "/account", {
      timeout: 10_000,
    });
    expect(page.url()).toMatch(/returnTo=(?:%2F|\/)account/);

    // 8. Sign in again from the returnTo redirect
    await page.fill("#login-email", "customer@kalaandkiln.in");
    await page.fill("#login-password", "Customer#Kiln2026!");
    await page.click('button[type="submit"]');

    // 9. After login, returns to /account
    await page.waitForURL((url) => url.pathname === "/account", { timeout: 12_000 });
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator("text=Aarav Kulkarni").first()).toBeVisible();

    await page.close();
  });
});

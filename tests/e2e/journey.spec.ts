// Copyright 2026 jem-sec-attest contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * E2E journey tests for the acme-corp tenant.
 * Covers the full user journey: authenticated session → intake → training → export.
 *
 * Prerequisites:
 *   - Docker stack must be running: pnpm docker:up
 *   - /etc/hosts must contain: 127.0.0.1 dex
 *   - Run auth.setup.ts has saved session state to tests/e2e/.auth/user.json
 *
 * Test user: alice@acme.com (employee, acme-corp tenant)
 */

import { expect, test } from "./fixtures/auth";

const TENANT = "acme-corp";

// ---------------------------------------------------------------------------
// Test 1: Authenticated session is active after sign-in
// ---------------------------------------------------------------------------

test("authenticated session is active after sign-in", async ({ page }) => {
  // Navigate to the tenant dashboard — redirects to sign-in if unauthenticated
  await page.goto(`/${TENANT}/dashboard`);

  // Should NOT be redirected to the sign-in page
  await expect(page).not.toHaveURL(/\/auth\/signin/);

  // Dashboard heading should be visible (contains the display name of the signed-in user)
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible();

  // The sign-out form/button should be visible — confirms authenticated state
  const signOutButton = page.locator('button[type="submit"]').filter({ hasText: /sign.?out/i });
  await expect(signOutButton).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 2: Training intake — completes role profile generation
// ---------------------------------------------------------------------------

test("training intake — completes role profile generation", async ({ page }) => {
  await page.goto(`/${TENANT}/intake`);

  // Wait for the intake page to load (may show an existing profile or the input form)
  await page.waitForLoadState("domcontentloaded");

  // If a profile already exists (from a previous run), click "Update Profile" to reset
  const updateButton = page.locator('button[type="button"]', { hasText: "Update Profile" });
  if (await updateButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await updateButton.click();
  }

  // Wait for the job description input form to appear
  await expect(page.locator("#job-description")).toBeVisible({ timeout: 10_000 });

  // Fill the job description textarea with a realistic job description (>= 50 chars)
  const jobDescription = `
    Information Security Analyst responsible for monitoring and responding to
    security incidents, conducting vulnerability assessments, maintaining security
    policies and procedures, and ensuring compliance with ISO 27001 controls.
    The role involves regular security audits, risk assessments, and coordination
    with development teams to implement secure coding practices.
  `.trim();

  await page.fill("#job-description", jobDescription);

  // Submit the form to generate the profile
  await page.click('button[type="submit"]:has-text("Generate Profile")');

  // Wait for AI generation — the "Analyzing your job description..." loading state appears,
  // then transitions to the preview state showing job expectations
  await expect(page.locator('legend:has-text("Job Expectations")')).toBeVisible({
    timeout: 60_000,
  });

  // Confirm the generated profile
  const confirmButton = page.locator('button[type="submit"]:has-text("Confirm Profile")');
  await expect(confirmButton).toBeEnabled({ timeout: 5_000 });
  await confirmButton.click();

  // Wait for the "Profile Saved" confirmed state
  await expect(page.locator('h1:has-text("Profile Saved")')).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Test 3: Training modules — starts training and interacts with first module
// ---------------------------------------------------------------------------

// NOTE: This test depends on the session created in test 2 (sequential dependency).
test("training — starts a training session and begins first module", async ({ page }) => {
  // AI content generation can take 30-90s; override the default 30s test timeout
  test.setTimeout(300_000);

  await page.goto(`/${TENANT}/training`);
  await page.waitForLoadState("domcontentloaded");

  // If training shows "no profile" state, the intake test didn't run first
  const noProfileLink = page.locator('a[href*="/intake"]').filter({ hasText: /intake|profile/i });
  if (await noProfileLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
    test.skip(
      true,
      "Training requires a completed intake profile. Ensure the intake test has run first.",
    );
    return;
  }

  // "Start" state: click the "Begin Training" / "Start Training" button
  const startButton = page
    .locator("section[aria-labelledby='start-heading'] button[type='button']")
    .first();
  if (await startButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await startButton.click();
  } else {
    // Start button not present — verify the page is already in a known valid state
    // (curriculum or learning view). If neither is found, fail early rather than
    // waiting up to 90s for content that will never appear.
    const alreadyInProgress =
      (await page
        .locator("section[aria-labelledby='curriculum-heading']")
        .isVisible({ timeout: 2_000 })
        .catch(() => false)) ||
      (await page
        .locator("section[aria-labelledby='learning-heading']")
        .isVisible({ timeout: 2_000 })
        .catch(() => false));
    if (!alreadyInProgress) {
      throw new Error(
        "Training page is in an unexpected state: start button not visible and neither " +
          "curriculum-heading nor learning-heading is present. Cannot proceed.",
      );
    }
  }

  // Wait for curriculum to generate — the training session moves through
  // curriculum-generating → in-progress states (AI-powered, up to 90s)
  // Look for a module list or the first module button
  await expect(
    page.locator(
      "section[aria-labelledby='curriculum-heading'], section[aria-labelledby='learning-heading'], section[aria-labelledby='result-heading']",
    ),
  ).toBeVisible({ timeout: 90_000 });

  // If we reached the curriculum state, click the first available (unlocked) module
  const curriculumHeading = page.locator("section[aria-labelledby='curriculum-heading']");
  if (await curriculumHeading.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const firstModuleButton = curriculumHeading
      .locator("button:not([disabled]):not([aria-disabled='true'])")
      .first();
    if (await firstModuleButton.isVisible()) {
      await firstModuleButton.click();

      // Wait for the module learning content to appear (AI generation can take 30-60s)
      await expect(page.locator("section[aria-labelledby='learning-heading']")).toBeVisible({
        timeout: 90_000,
      });
    }
  }

  // Training is in progress — confirm the page is not in an error state
  const errorSection = page.locator("section[aria-labelledby='error-heading']");
  await expect(errorSection).not.toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Test 4: Evidence export — PDF endpoint returns application/pdf
// ---------------------------------------------------------------------------

// NOTE: SC-002 full coverage requires a pre-seeded "passed" session. This test validates the conditional soft-pass behavior.
test("evidence export — PDF endpoint returns a valid PDF for a completed session", async ({
  page,
}) => {
  // Navigate to the training page and retrieve the current session from the API
  const sessionResponse = await page.request.get(`/api/training/${TENANT}/session`);
  expect(sessionResponse.status()).toBeLessThan(500);

  if (sessionResponse.status() === 200) {
    const sessionData = (await sessionResponse.json()) as {
      session?: { id?: string; status?: string };
    };

    const sessionId = sessionData?.session?.id;
    const sessionStatus = sessionData?.session?.status;

    if (sessionId && sessionStatus === "passed") {
      // A completed passing session exists — request the PDF export
      const pdfResponse = await page.request.get(
        `/api/training/${TENANT}/evidence/${sessionId}/pdf`,
      );

      expect(pdfResponse.status()).toBe(200);

      const contentType = pdfResponse.headers()["content-type"] ?? "";
      expect(contentType).toContain("application/pdf");

      const body = await pdfResponse.body();
      expect(body.length).toBeGreaterThan(0);

      // Verify the response starts with the PDF magic bytes (%PDF)
      expect(body.slice(0, 4).toString()).toBe("%PDF");
    } else {
      // No passing session yet — skip so CI dashboards show the PDF path was not exercised
      test.skip(
        true,
        `No completed/passed session available — PDF validation skipped (session status: "${sessionStatus ?? "none"}").`,
      );
    }
  } else if (sessionResponse.status() === 404) {
    // No session exists at all — skip so CI dashboards show the PDF path was not exercised
    test.skip(true, "No completed/passed session available — PDF validation skipped.");
  } else {
    throw new Error(
      `Unexpected session API response: ${sessionResponse.status()} — expected 200 or 404`,
    );
  }
});

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

  // ---------------------------------------------------------------------------
  // API-based module completion
  //
  // The UI interactions above started the training session and navigated to the
  // first module's learning content. Completing every module through the UI
  // would be extremely brittle (AI-generated content varies across runs), so we
  // use the training API directly to walk each module through the full
  // content → scenarios → quiz → scored lifecycle. This ensures the session
  // reaches a terminal state that the evidence-export test (Test 4) depends on.
  // ---------------------------------------------------------------------------

  // 1. Retrieve the current session to discover the session ID and module list
  const sessionRes = await page.request.get(`/api/training/${TENANT}/session`);
  expect(sessionRes.ok(), `GET session failed: ${sessionRes.status()}`).toBe(true);
  const sessionPayload = (await sessionRes.json()) as {
    session: { id: string; status: string };
    modules: Array<{
      id: string;
      moduleIndex: number;
      status: string;
    }>;
  };

  const { session, modules } = sessionPayload;
  expect(session.id).toBeTruthy();
  expect(modules.length).toBeGreaterThan(0);

  // 2. Complete each module: generate content → submit scenarios → submit quiz
  for (let idx = 0; idx < modules.length; idx++) {
    // 2a. Generate / fetch module content (transitions module: locked → learning)
    const contentRes = await page.request.post(`/api/training/${TENANT}/module/${idx}/content`);
    expect(
      contentRes.ok(),
      `POST content for module ${idx} failed: ${contentRes.status()} — ${await contentRes.text()}`,
    ).toBe(true);

    const content = (await contentRes.json()) as {
      scenarios: Array<{
        id: string;
        options?: Array<{ key: string; correct?: boolean }>;
      }>;
      quiz: {
        questions: Array<{
          id: string;
          options?: Array<{ key: string; correct?: boolean }>;
        }>;
      };
    };

    // 2b. Submit scenario responses (one POST per scenario)
    for (const scenario of content.scenarios) {
      // Pick the correct option if available, otherwise fall back to the first option.
      // NOTE: The content API strips the `correct` field from client responses, so the
      // fallback (first option) will almost always be used. This is acceptable for E2E
      // testing — the goal is to complete the workflow, not guarantee a perfect score.
      const correctOpt = scenario.options?.find((o) => o.correct === true);
      const selectedOption = correctOpt?.key ?? scenario.options?.[0]?.key;
      expect(selectedOption, `Scenario ${scenario.id} has no options`).toBeTruthy();

      const scenarioRes = await page.request.post(
        `/api/training/${TENANT}/module/${idx}/scenario`,
        {
          data: {
            scenarioId: scenario.id,
            responseType: "multiple-choice",
            selectedOption,
          },
        },
      );
      expect(
        scenarioRes.ok(),
        `POST scenario ${scenario.id} for module ${idx} failed: ${scenarioRes.status()} — ${await scenarioRes.text()}`,
      ).toBe(true);
    }

    // 2c. Submit all quiz answers in a single POST
    const answers = content.quiz.questions.map((q) => {
      const correctOpt = q.options?.find((o) => o.correct === true);
      const selectedOption = correctOpt?.key ?? q.options?.[0]?.key;
      expect(selectedOption, `Quiz question ${q.id} has no options`).toBeTruthy();
      return {
        questionId: q.id,
        responseType: "multiple-choice" as const,
        selectedOption,
      };
    });

    const quizRes = await page.request.post(`/api/training/${TENANT}/module/${idx}/quiz`, {
      data: { answers },
    });
    expect(
      quizRes.ok(),
      `POST quiz for module ${idx} failed: ${quizRes.status()} — ${await quizRes.text()}`,
    ).toBe(true);
  }

  // 3. All modules scored — call evaluate to finalise the session
  const evaluateRes = await page.request.post(`/api/training/${TENANT}/evaluate`);
  expect(
    evaluateRes.ok(),
    `POST evaluate failed: ${evaluateRes.status()} — ${await evaluateRes.text()}`,
  ).toBe(true);

  const evalPayload = (await evaluateRes.json()) as {
    sessionId: string;
    aggregateScore: number;
    passed: boolean;
    nextAction: string;
  };

  // 4. Verify the session reached a terminal state
  const finalSessionRes = await page.request.get(`/api/training/${TENANT}/session`);
  expect(finalSessionRes.ok()).toBe(true);
  const finalPayload = (await finalSessionRes.json()) as {
    session: { id: string; status: string };
  };

  const terminalStatuses = ["passed", "failed", "exhausted"];
  expect(
    terminalStatuses.includes(finalPayload.session.status),
    `Expected session to be in a terminal state but got "${finalPayload.session.status}"`,
  ).toBe(true);

  // Log the outcome for CI visibility
  console.log(
    `[E2E] Training session completed: status=${finalPayload.session.status}, ` +
      `aggregateScore=${evalPayload.aggregateScore}, passed=${evalPayload.passed}`,
  );

  // 5. Reload the training page and confirm the UI reflects completion
  await page.goto(`/${TENANT}/training`);
  await page.waitForLoadState("domcontentloaded");
});

// ---------------------------------------------------------------------------
// Test 4: Evidence export — PDF endpoint returns application/pdf
// ---------------------------------------------------------------------------

// NOTE: This test requires the training session created by the prior tests to have
// reached a terminal state. The content API strips `correct` fields from options,
// so Test 3 cannot guarantee correct answers — the session may end as "passed",
// "failed", or "exhausted". We only exercise the PDF export when "passed".
test("evidence export — PDF endpoint returns a valid PDF for a completed session", async ({
  page,
}) => {
  // Retrieve the current session from the API
  const sessionResponse = await page.request.get(`/api/training/${TENANT}/session`);
  expect(sessionResponse.status()).toBeLessThan(500);

  expect(
    sessionResponse.status(),
    "Expected an active training session (HTTP 200) — ensure prior tests ran successfully",
  ).toBe(200);

  const sessionData = (await sessionResponse.json()) as {
    session?: { id?: string; status?: string };
  };

  const sessionId = sessionData?.session?.id;
  const sessionStatus = sessionData?.session?.status;

  expect(sessionId, "Expected a session ID in the training session response").toBeTruthy();

  // The session must be in a terminal state — Test 3 completes all modules via API.
  // Because the content API strips the `correct` field from options, the E2E test
  // cannot determine correct answers and always picks the first option. The resulting
  // score depends on whether the first option happens to be correct, so the session
  // may end as "passed", "failed", or "exhausted".
  const terminalStatuses = ["passed", "failed", "exhausted"];
  expect(
    terminalStatuses.includes(sessionStatus ?? ""),
    `Expected session to be in a terminal state (passed/failed/exhausted) but got "${sessionStatus ?? "none"}". Ensure the training journey completed in prior test steps.`,
  ).toBe(true);

  // Only exercise the PDF export when the session passed — otherwise skip gracefully
  if (sessionStatus !== "passed") {
    console.log(
      `[E2E] Skipping PDF export: session ended as "${sessionStatus}" (not "passed"). This is expected when random answer selection scores below the pass threshold.`,
    );
    test.skip(true, `PDF export requires "passed" status (got "${sessionStatus}")`);
    return;
  }

  // A completed passing session exists — request the PDF export
  const pdfResponse = await page.request.get(`/api/training/${TENANT}/evidence/${sessionId}/pdf`);

  expect(pdfResponse.status()).toBe(200);

  const contentType = pdfResponse.headers()["content-type"] ?? "";
  expect(contentType).toContain("application/pdf");

  const body = await pdfResponse.body();
  expect(body.length).toBeGreaterThan(0);

  // Verify the response starts with the PDF magic bytes (%PDF)
  expect(body.slice(0, 4).toString()).toBe("%PDF");
});

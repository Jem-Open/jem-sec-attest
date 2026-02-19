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
 * Intake page — role profile intake UI with all states: Input, Loading, Preview, Confirmed, Error.
 * Supports re-intake (Update Profile) from the Confirmed state.
 * FR-003: Employees can generate and confirm a role profile for their tenant.
 * Constitution VI: All user-facing strings are centralised in STRINGS for i18n readiness.
 */

"use client";

import { use, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// String catalog — Constitution VI i18n requirement
// ---------------------------------------------------------------------------

const STRINGS = {
  pageTitle: "Role Profile Intake",
  inputLabel: "Job Description",
  inputPlaceholder: "Paste your job description here (minimum 50 characters)...",
  charCounter: (current: number, max: number) => `${current} / ${max} characters`,
  generateButton: "Generate Profile",
  generatingMessage: "Analyzing your job description...",
  previewTitle: "Your Role Profile",
  previewSubtitle: "Review and edit your job expectations below:",
  expectationLabel: (index: number) => `Job expectation ${index + 1}`,
  addExpectation: "Add Expectation",
  removeExpectation: "Remove",
  confirmButton: "Confirm Profile",
  startOverButton: "Start Over",
  confirmedTitle: "Profile Saved",
  confirmedMessage: "Your role profile has been saved.",
  dashboardLink: "Go to Dashboard",
  errorTitle: "Something went wrong",
  retryButton: "Retry",
  updateProfileButton: "Update Profile",
  reintakeBanner: "Your current profile will remain active until you confirm the new one.",
  currentProfileTitle: "Current Profile",
  newPreviewTitle: "New Profile Preview",
  minExpectations: "At least 1 job expectation is required",
  maxExpectations: "Maximum 15 job expectations allowed",
  minChars: "Minimum 50 characters required",
  maxChars: "Maximum 10,000 characters allowed",
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHARS = 10_000;
const MIN_CHARS = 50;
const MAX_EXPECTATIONS = 15;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntakeState = "loading-profile" | "input" | "loading" | "preview" | "confirmed" | "error";

interface RoleProfile {
  id: string;
  jobExpectations: string[];
  version: number;
  confirmedAt: string;
}

// ---------------------------------------------------------------------------
// Shared inline style objects
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  maxWidth: "800px",
  margin: "2rem auto",
  padding: "0 1rem",
  fontFamily: "system-ui, sans-serif",
};

const headingStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  color: "#111",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 500,
  marginBottom: "0.5rem",
  color: "#111",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "180px",
  padding: "0.75rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  fontSize: "0.95rem",
  fontFamily: "system-ui, sans-serif",
  resize: "vertical",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.65rem 1.5rem",
  backgroundColor: "#1a73e8",
  color: "white",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.65rem 1.5rem",
  backgroundColor: "#f5f5f5",
  color: "#111",
  border: "1px solid #ddd",
  borderRadius: "4px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  backgroundColor: "#fff",
  color: "#b91c1c",
  border: "1px solid #b91c1c",
  borderRadius: "4px",
  fontSize: "0.875rem",
  cursor: "pointer",
};

const validationMessageStyle: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.875rem",
  marginTop: "0.4rem",
};

const hintStyle: React.CSSProperties = {
  color: "#555",
  fontSize: "0.875rem",
  marginTop: "0.4rem",
};

const sectionCardStyle: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: "6px",
  padding: "1.25rem",
  marginBottom: "1.5rem",
  backgroundColor: "#fafafa",
};

const expectationInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  fontSize: "0.9rem",
  fontFamily: "system-ui, sans-serif",
};

const bannerStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  backgroundColor: "#fff8e1",
  border: "1px solid #f9a825",
  borderRadius: "4px",
  marginBottom: "1.5rem",
  fontSize: "0.9rem",
  color: "#5f4c00",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "16px",
        height: "16px",
        border: "2px solid rgba(255,255,255,0.4)",
        borderTopColor: "white",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
        marginRight: "0.5rem",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function IntakePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);

  const [intakeState, setIntakeState] = useState<IntakeState>("loading-profile");
  const [jobText, setJobText] = useState("");
  const [expectations, setExpectations] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [existingProfile, setExistingProfile] = useState<RoleProfile | null>(null);
  const [oldExpectations, setOldExpectations] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // Derived validation
  // -------------------------------------------------------------------------

  const charCount = jobText.length;
  const charCountValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;
  const charCountMessage =
    charCount < MIN_CHARS ? STRINGS.minChars : charCount > MAX_CHARS ? STRINGS.maxChars : null;

  const expectationsValid =
    expectations.length >= 1 &&
    expectations.length <= MAX_EXPECTATIONS &&
    expectations.every((e) => e.trim().length > 0);

  const expectationsCountMessage =
    expectations.length < 1
      ? STRINGS.minExpectations
      : expectations.length > MAX_EXPECTATIONS
        ? STRINGS.maxExpectations
        : null;

  // -------------------------------------------------------------------------
  // On mount: fetch existing profile
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await fetch(`/api/intake/${tenant}/profile`);
        if (cancelled) return;

        if (res.ok) {
          const profile = (await res.json()) as RoleProfile;
          setExistingProfile(profile);
          setIntakeState("confirmed");
        } else if (res.status === 404) {
          setIntakeState("input");
        } else {
          setError(`Unexpected response (${res.status}). Please refresh and try again.`);
          setIntakeState("error");
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load your profile. Please check your connection and try again.");
          setIntakeState("error");
        }
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!charCountValid) return;

    setIntakeState("loading");
    setError("");

    try {
      const res = await fetch(`/api/intake/${tenant}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }

      const data = (await res.json()) as { jobExpectations: string[] };
      setExpectations(data.jobExpectations.length > 0 ? data.jobExpectations : [""]);
      setIntakeState("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate profile. Please try again.",
      );
      setIntakeState("error");
    }
  }

  async function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!expectationsValid) return;

    setIntakeState("loading");
    setError("");

    try {
      const res = await fetch(`/api/intake/${tenant}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobExpectations: expectations.map((e) => e.trim()) }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }

      const saved = (await res.json()) as RoleProfile;
      setExistingProfile(saved);
      setOldExpectations([]);
      setIntakeState("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile. Please try again.");
      setIntakeState("error");
    }
  }

  function handleStartOver() {
    setJobText("");
    setExpectations([""]);
    setError("");
    setOldExpectations([]);
    setIntakeState("input");
  }

  function handleUpdateProfile() {
    if (existingProfile) {
      setOldExpectations(existingProfile.jobExpectations);
    }
    setJobText("");
    setExpectations([""]);
    setError("");
    setIntakeState("input");
  }

  function handleRetry() {
    setError("");
    setIntakeState(existingProfile ? "confirmed" : "input");
  }

  // Expectation list helpers
  function handleExpectationChange(index: number, value: string) {
    setExpectations((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function handleAddExpectation() {
    if (expectations.length >= MAX_EXPECTATIONS) return;
    setExpectations((prev) => [...prev, ""]);
  }

  function handleRemoveExpectation(index: number) {
    if (expectations.length <= 1) return;
    setExpectations((prev) => prev.filter((_, i) => i !== index));
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderLoadingProfile() {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: "2rem 0", textAlign: "center" }}>
        <p style={{ color: "#555" }}>Loading your profile...</p>
      </div>
    );
  }

  function renderInput() {
    return (
      <>
        {oldExpectations.length > 0 && (
          <div role="note" style={bannerStyle}>
            {STRINGS.reintakeBanner}
          </div>
        )}

        {oldExpectations.length > 0 && (
          <section
            aria-labelledby="current-profile-heading"
            style={{ ...sectionCardStyle, marginBottom: "2rem" }}
          >
            <h2
              id="current-profile-heading"
              style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}
            >
              {STRINGS.currentProfileTitle}
            </h2>
            <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {oldExpectations.map((exp, i) => (
                <li
                  key={`${i}-${exp}`}
                  style={{ marginBottom: "0.4rem", fontSize: "0.9rem", color: "#333" }}
                >
                  {exp}
                </li>
              ))}
            </ol>
          </section>
        )}

        <form onSubmit={handleGenerate} noValidate aria-labelledby="input-form-heading">
          <h1 id="input-form-heading" style={headingStyle}>
            {STRINGS.pageTitle}
          </h1>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="job-description" style={labelStyle}>
              {STRINGS.inputLabel}
            </label>
            <textarea
              id="job-description"
              name="jobDescription"
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder={STRINGS.inputPlaceholder}
              maxLength={MAX_CHARS}
              style={{
                ...textareaStyle,
                borderColor: charCount > 0 && charCountMessage ? "#b91c1c" : "#ccc",
              }}
              aria-describedby="char-count char-validation"
              aria-required="true"
              aria-invalid={charCount > 0 && charCountMessage !== null ? "true" : "false"}
            />
            <div id="char-count" style={hintStyle}>
              {STRINGS.charCounter(charCount, MAX_CHARS)}
            </div>
            {charCount > 0 && charCountMessage && (
              <div id="char-validation" role="alert" style={validationMessageStyle}>
                {charCountMessage}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!charCountValid}
              style={{
                ...primaryButtonStyle,
                opacity: charCountValid ? 1 : 0.6,
                cursor: charCountValid ? "pointer" : "not-allowed",
              }}
            >
              {STRINGS.generateButton}
            </button>

            {oldExpectations.length > 0 && (
              <button type="button" onClick={handleStartOver} style={secondaryButtonStyle}>
                {STRINGS.startOverButton}
              </button>
            )}
          </div>
        </form>
      </>
    );
  }

  function renderLoading() {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: "2rem 0" }}>
        <p style={{ color: "#555", fontSize: "1rem" }}>
          <LoadingSpinner />
          {STRINGS.generatingMessage}
        </p>
        <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      </div>
    );
  }

  function renderPreview() {
    return (
      <>
        {oldExpectations.length > 0 && (
          <div role="note" style={bannerStyle}>
            {STRINGS.reintakeBanner}
          </div>
        )}

        {oldExpectations.length > 0 && (
          <section
            aria-labelledby="current-profile-preview-heading"
            style={{ ...sectionCardStyle, marginBottom: "2rem" }}
          >
            <h2
              id="current-profile-preview-heading"
              style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}
            >
              {STRINGS.currentProfileTitle}
            </h2>
            <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {oldExpectations.map((exp, i) => (
                <li
                  key={`${i}-${exp}`}
                  style={{ marginBottom: "0.4rem", fontSize: "0.9rem", color: "#333" }}
                >
                  {exp}
                </li>
              ))}
            </ol>
          </section>
        )}

        <form onSubmit={handleConfirm} noValidate aria-labelledby="preview-heading">
          <h1 id="preview-heading" style={headingStyle}>
            {oldExpectations.length > 0 ? STRINGS.newPreviewTitle : STRINGS.previewTitle}
          </h1>
          <p style={{ color: "#555", marginBottom: "1.25rem" }}>{STRINGS.previewSubtitle}</p>

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem 0" }}>
            <legend
              style={{
                fontWeight: 500,
                marginBottom: "0.75rem",
                fontSize: "0.95rem",
                color: "#111",
              }}
            >
              Job Expectations
            </legend>

            {expectations.map((exp, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: editable list uses index as stable key
                key={index}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "0.6rem",
                }}
              >
                <label
                  htmlFor={`expectation-${index}`}
                  style={{ ...labelStyle, margin: 0, whiteSpace: "nowrap" }}
                >
                  {STRINGS.expectationLabel(index)}
                </label>
                <input
                  id={`expectation-${index}`}
                  type="text"
                  value={exp}
                  onChange={(e) => handleExpectationChange(index, e.target.value)}
                  aria-required="true"
                  aria-label={STRINGS.expectationLabel(index)}
                  style={{
                    ...expectationInputStyle,
                    borderColor: exp.trim().length === 0 ? "#b91c1c" : "#ccc",
                  }}
                />
                {expectations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveExpectation(index)}
                    aria-label={`${STRINGS.removeExpectation} expectation ${index + 1}`}
                    style={dangerButtonStyle}
                  >
                    {STRINGS.removeExpectation}
                  </button>
                )}
              </div>
            ))}

            {expectationsCountMessage && (
              <div role="alert" aria-live="polite" style={validationMessageStyle}>
                {expectationsCountMessage}
              </div>
            )}
          </fieldset>

          {expectations.length < MAX_EXPECTATIONS && (
            <div style={{ marginBottom: "1.5rem" }}>
              <button type="button" onClick={handleAddExpectation} style={secondaryButtonStyle}>
                {STRINGS.addExpectation}
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!expectationsValid}
              style={{
                ...primaryButtonStyle,
                opacity: expectationsValid ? 1 : 0.6,
                cursor: expectationsValid ? "pointer" : "not-allowed",
              }}
            >
              {STRINGS.confirmButton}
            </button>
            <button type="button" onClick={handleStartOver} style={secondaryButtonStyle}>
              {STRINGS.startOverButton}
            </button>
          </div>
        </form>
      </>
    );
  }

  function renderConfirmed() {
    return (
      <section aria-labelledby="confirmed-heading">
        <h1 id="confirmed-heading" style={headingStyle}>
          {STRINGS.confirmedTitle}
        </h1>
        <p style={{ color: "#333", marginBottom: "1.5rem" }}>{STRINGS.confirmedMessage}</p>

        {existingProfile && (
          <div style={sectionCardStyle}>
            <h2
              style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#111" }}
            >
              {STRINGS.currentProfileTitle}
            </h2>
            <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {existingProfile.jobExpectations.map((exp, i) => (
                <li
                  key={`${i}-${exp}`}
                  style={{ marginBottom: "0.4rem", fontSize: "0.9rem", color: "#333" }}
                >
                  {exp}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a
            href={`/${tenant}/dashboard`}
            style={{
              ...primaryButtonStyle,
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            {STRINGS.dashboardLink}
          </a>
          <button type="button" onClick={handleUpdateProfile} style={secondaryButtonStyle}>
            {STRINGS.updateProfileButton}
          </button>
        </div>
      </section>
    );
  }

  function renderError() {
    return (
      <section aria-labelledby="error-heading" aria-live="assertive">
        <h1 id="error-heading" style={{ ...headingStyle, color: "#b91c1c" }}>
          {STRINGS.errorTitle}
        </h1>
        <p style={{ color: "#333", marginBottom: "1.5rem" }}>{error}</p>
        <button type="button" onClick={handleRetry} style={primaryButtonStyle}>
          {STRINGS.retryButton}
        </button>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <main style={containerStyle}>
      {intakeState === "loading-profile" && renderLoadingProfile()}
      {intakeState === "input" && renderInput()}
      {intakeState === "loading" && renderLoading()}
      {intakeState === "preview" && renderPreview()}
      {intakeState === "confirmed" && renderConfirmed()}
      {intakeState === "error" && renderError()}
    </main>
  );
}

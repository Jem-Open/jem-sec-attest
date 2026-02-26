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

import styles from "./error.module.css";

/**
 * Auth error page — displays user-friendly error messages.
 * FR-006: Never exposes raw error details to the user.
 * WCAG 2.1 AA: Keyboard navigable, screen-reader accessible, no color-only information.
 */

const ERROR_MESSAGES: Record<string, string> = {
  signin_cancelled: "Sign-in was not completed.",
  invalid_request: "Something went wrong. Please try again.",
  missing_config: "Single sign-on is not configured for your organization.",
  invalid_config: "Single sign-on configuration is invalid for your organization.",
  auth_failed: "Authentication failed. Please try again.",
  "state-mismatch": "Your sign-in session expired. Please try again.",
  "idp-error": "The identity provider reported an error.",
  "token-exchange-failed": "Authentication could not be completed.",
  "missing-required-claims": "Required account information was not provided.",
};

const DEFAULT_MESSAGE = "Something went wrong.";

export default async function ErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { tenant } = await params;
  const { code } = await searchParams;

  const message = (code && ERROR_MESSAGES[code]) ?? DEFAULT_MESSAGE;

  return (
    <>
      <main
        aria-labelledby="error-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            width: "100%",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              fontSize: "2.5rem",
              marginBottom: "1rem",
            }}
          >
            {/* SVG warning icon — visible indicator alongside text, not color-only */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              style={{ display: "inline-block", verticalAlign: "middle" }}
            >
              <path
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="#b91c1c"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            id="error-heading"
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "#111",
            }}
          >
            Sign-in error
          </h1>

          <p
            style={{
              color: "#333",
              marginBottom: "2rem",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>

          <a
            href={`/${tenant}/auth/signin`}
            aria-label="Try signing in again"
            className={styles.link}
          >
            Try Again
          </a>
        </div>
      </main>
    </>
  );
}

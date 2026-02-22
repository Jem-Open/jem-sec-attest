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
 * Sign-in page — tenant-branded SSO entry point.
 * FR-001: Displays sign-in button that initiates OIDC flow.
 * T030: i18n — all user-facing strings use getTranslation().
 */

import { getTranslation } from "@/i18n";
import { cookies } from "next/headers";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value ?? "en";
  const t = await getTranslation(locale);

  // TODO: Load tenant branding from config when wired
  const displayName = tenant.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main
      id="main-content"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "400px",
          width: "100%",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{displayName}</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>{t("auth.signInTitle")}</p>
        <a
          href={`/api/auth/${tenant}/signin`}
          aria-label={`${t("auth.signInWithSSO")} — ${displayName}`}
          style={{
            display: "inline-block",
            padding: "0.75rem 2rem",
            backgroundColor: "#1a73e8",
            color: "white",
            textDecoration: "none",
            borderRadius: "4px",
            fontSize: "1rem",
            fontWeight: 500,
          }}
        >
          {t("auth.signInWithSSO")}
        </a>
      </div>
    </main>
  );
}

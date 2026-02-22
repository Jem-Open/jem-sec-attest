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
 * Dashboard page — authenticated landing page after sign-in.
 * FR-005: Session-gated access; redirects to sign-in if no valid session.
 * T031: i18n — all user-facing strings use getTranslation().
 */

import { getSession } from "@/auth/session/session-manager";
import { getTranslation } from "@/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const session = await getSession();

  if (!session.employee) {
    redirect(`/${tenant}/auth/signin`);
  }

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value ?? "en";
  const t = await getTranslation(locale);

  return (
    <main
      id="main-content"
      style={{
        maxWidth: "800px",
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid #eee",
        }}
      >
        <h1 style={{ fontSize: "1.25rem" }}>
          {t("dashboard.welcome", { displayName: session.employee.displayName })}
        </h1>
        <form action={`/api/auth/${tenant}/signout`} method="POST">
          <button
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#f5f5f5",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            {t("dashboard.signOut")}
          </button>
        </form>
      </header>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        {t("dashboard.signedInAs", { email: session.employee.email, tenant })}
      </p>
      <nav aria-label="Training actions">
        <a
          href={`/${tenant}/intake`}
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "4px",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          {t("dashboard.roleProfileIntake")}
        </a>
      </nav>
    </main>
  );
}

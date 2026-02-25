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
import { getStorage } from "@/storage/factory";
import { SessionRepository } from "@/training/session-repository";
import type { TrainingSession } from "@/training/types";
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

  if (session.employee.tenantId !== tenant) {
    redirect(`/${tenant}/auth/signin`);
  }

  const employeeId = session.employee.employeeId;

  let recentSessions: TrainingSession[] = [];
  try {
    const storage = await getStorage();
    const sessionRepo = new SessionRepository(storage);
    recentSessions = await sessionRepo.findSessionHistory(tenant, employeeId, { limit: 3 });
  } catch {
    recentSessions = []; // non-fatal — dashboard degrades gracefully
  }

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
      <nav
        aria-label="Training actions"
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
      >
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
        <a
          href={`/${tenant}/training`}
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#1a73e8",
            color: "#fff",
            borderRadius: "4px",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          {t("dashboard.startTraining")}
        </a>
      </nav>
      {recentSessions.length > 0 && (
        <section aria-labelledby="recent-training-heading" style={{ marginTop: "2rem" }}>
          <h2
            id="recent-training-heading"
            style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#111" }}
          >
            {t("dashboard.recentTraining")}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {recentSessions.map((sess) => {
              const statusCategory =
                sess.status === "passed"
                  ? "passed"
                  : sess.status === "failed" || sess.status === "exhausted"
                    ? "failed"
                    : sess.status === "abandoned"
                      ? "abandoned"
                      : "in_progress";
              const statusColors = {
                passed: { bg: "#dcfce7", text: "#166534" },
                failed: { bg: "#fee2e2", text: "#991b1b" },
                in_progress: { bg: "#dbeafe", text: "#1e40af" },
                abandoned: { bg: "#f3f4f6", text: "#374151" },
              } as const;
              const { bg: statusBg, text: statusText } = statusColors[statusCategory];
              const pct =
                sess.aggregateScore != null ? Math.round(sess.aggregateScore * 100) : null;
              const dateStr = sess.createdAt
                ? new Date(sess.createdAt).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "\u2014";
              return (
                <li
                  key={sess.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.5rem",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    backgroundColor: "#fafafa",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#555" }}>
                    {t("training.history.dateLabel")} {dateStr}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {pct != null && (
                      <span style={{ color: "#555" }}>
                        {t("training.history.scoreLabel")} {pct}%
                      </span>
                    )}
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.2rem 0.6rem",
                        borderRadius: "3px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: statusBg,
                        color: statusText,
                      }}
                      aria-label={`Status: ${t(`training.history.status.${statusCategory}`)}`}
                    >
                      {t(`training.history.status.${statusCategory}`)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

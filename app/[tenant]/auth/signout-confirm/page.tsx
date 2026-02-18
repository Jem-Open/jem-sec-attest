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
 * Sign-out confirmation page — displayed after successful session destruction.
 * Provides a "Sign back in" link to the tenant sign-in page.
 */

export default async function SignOutConfirmPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  return (
    <main
      style={{
        maxWidth: "480px",
        margin: "4rem auto",
        padding: "2rem 1rem",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          marginBottom: "1rem",
          color: "#111",
        }}
      >
        You have been signed out.
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#555",
          marginBottom: "2rem",
        }}
      >
        Your session has been securely terminated.
      </p>
      <a
        href={`/${tenant}/auth/signin`}
        style={{
          display: "inline-block",
          padding: "0.625rem 1.5rem",
          backgroundColor: "#0070f3",
          color: "#fff",
          textDecoration: "none",
          borderRadius: "4px",
          fontSize: "0.9375rem",
          fontWeight: 500,
        }}
      >
        Sign back in
      </a>
    </main>
  );
}

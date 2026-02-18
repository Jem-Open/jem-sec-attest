<!--
  Sync Impact Report
  ==================
  Version change: 1.0.0 -> 1.1.0 (MINOR — new principle added)
  Modified principles: None
  Added sections:
    - Principle IX: Technology Stack (Next.js + AI SDK mandate)
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ no update needed
      (Constitution Check is filled per-feature; Technical Context
      section already captures Language/Version and Primary Dependencies)
    - .specify/templates/spec-template.md — ✅ no update needed
    - .specify/templates/tasks-template.md — ✅ no update needed
  Follow-up TODOs:
    - CLAUDE.md should be updated when Next.js and AI SDK are installed
      to reflect the new active technologies.
-->

# jem-sec-attest Constitution

## Core Principles

### I. Configuration-as-Code Only

All administrative configuration — tenant setup, SSO settings,
AI/provider settings, compliance integrations (Sprinto), policies,
retention rules, and guardrails — MUST be defined in YAML or JSON
files and validated against a published schema.

- There MUST NOT be an admin web portal. Configuration changes are
  code-reviewed and version-controlled.
- Secrets MUST NEVER appear in configuration files. Use environment
  variable substitution (`${VAR}` or `${VAR:-default}` syntax) or
  secret-manager references (`secretRef:`) exclusively.
  `secretRef:` support MAY be deferred to a later feature provided
  environment variable substitution is available from the initial
  release.
- Every configuration schema MUST be published alongside the feature
  that consumes it, with example files and inline documentation.

**Rationale**: Code-reviewed config provides an auditable change
history, prevents configuration drift, and removes an entire class
of admin-portal security surface.

### II. Deterministic, Audit-Friendly Behavior

All AI-generated outputs MUST be constrained by a response schema
(e.g., JSON Schema, structured-output mode). Free-form LLM prose
MUST NOT drive workflow transitions.

- Training workflows MUST be modeled as explicit state machines with
  named steps and defined transitions. No implicit or free-form
  progression.
- Every evidence bundle MUST include version hashes for: the skill
  definition, the tenant configuration snapshot, and the application
  version that produced it.
- Identical inputs under identical configuration MUST produce
  structurally identical evidence artifacts (content may vary due to
  AI non-determinism, but schema and metadata MUST be stable).

**Rationale**: ISO 27001 auditors require reproducible, traceable
evidence. Schema-constrained outputs and version-stamped artifacts
make audit reviews straightforward.

### III. Security-First and Multi-Tenant Isolation

Every data-access path MUST enforce tenant scoping. Cross-tenant
data leakage is treated as a critical severity defect.

- Database queries, API responses, audit logs, and export operations
  MUST be scoped to the authenticated tenant context.
- Audit logs MUST NOT contain secrets, credentials, PII beyond what
  is strictly necessary, or raw sensitive content.
- User-provided job descriptions MUST be treated as untrusted input:
  sanitize, length-limit, and never execute or interpolate directly.
- All authentication flows MUST support tenant-scoped SSO; fallback
  mechanisms MUST NOT bypass tenant isolation.

**Rationale**: Multi-tenancy is the deployment model. A single
isolation failure compromises trust across every tenant.

### IV. Minimal Data Collection

The system MUST NOT persist raw job descriptions by default. Job
descriptions MUST be processed in-memory and only the derived role
profile stored.

- Training evidence (completion records, scores, attestation
  metadata) MUST be persisted according to the tenant's configured
  retention policy.
- Session transcripts MAY be stored (configurable per tenant) but
  MUST be redacted for secrets, credentials, and any content
  matching configurable sensitive-data patterns before persistence.
- When retention windows expire, data MUST be purged — not merely
  soft-deleted.

**Rationale**: Minimizing stored data reduces breach impact and
simplifies GDPR/privacy compliance. Processing ephemeral data
in-memory limits the attack surface.

### V. Pluggable Architecture

The system MUST use adapter interfaces for every external
integration point:

- **Config provider** — file system, Git, remote vault
- **Storage** — relational DB, object store
- **SSO** — SAML, OIDC
- **AI provider** — OpenAI, Anthropic, Azure OpenAI, etc.
- **PDF rendering** — headless browser, server-side library
- **Compliance integration** — Sprinto (first), extensible to others

Hard-coding hosting-provider assumptions (e.g., specific cloud
services, container runtimes) MUST be avoided. Adapters MUST
implement a documented interface and be selectable via
configuration.

**Rationale**: Pluggability enables self-hosted, cloud-agnostic, and
air-gapped deployments — a requirement for security-conscious
organizations adopting ISO 27001.

### VI. Accessibility and Localization

All user-facing interfaces MUST be accessible via keyboard
navigation and compatible with screen readers (WCAG 2.1 AA
minimum).

- English is the default locale.
- The i18n architecture MUST use externalized string catalogs so
  that contributors can add new locales without modifying
  application logic.
- UI components MUST NOT rely solely on color to convey information.

**Rationale**: Accessibility is a legal requirement in many
jurisdictions and an ethical baseline. Early i18n design avoids
costly retrofits.

### VII. Quality Gates

Comprehensive automated tests MUST cover the following critical
flows:

- Tenant resolution and isolation
- Authentication and authorization
- Training workflow state machine transitions
- Evidence bundle generation and integrity
- Sprinto adapter contract compliance

CI MUST run on every pull request. Merges MUST NOT proceed with
failing tests.

- Prefer clear, maintainable code over clever abstractions.
- Every adapter MUST have contract tests verifying interface
  compliance.

**Rationale**: The platform handles compliance evidence —
correctness failures undermine the product's core value proposition.

### VIII. Documentation Required

Every feature MUST ship with:

- User-facing documentation describing behavior and configuration.
- Example YAML/JSON configuration files demonstrating setup.
- Security guidance for deployers covering secrets management,
  network exposure, and tenant isolation verification.

Documentation MUST be updated in the same pull request as the code
change it describes.

**Rationale**: An undocumented security-training platform is an
ironic liability. Deployer security guidance is essential given the
self-hosted deployment model.

### IX. Technology Stack

The application MUST be built on **Next.js** (latest stable release)
and the **Vercel AI SDK** (latest stable release).

- All user-facing pages and API routes MUST use Next.js App Router
  conventions.
- AI-powered features (training content generation, role profiling,
  interactive assessments) MUST use the AI SDK for provider
  abstraction and structured-output handling.
- Dependency versions MUST track the latest stable major release.
  Upgrades to new major versions MUST be evaluated within 30 days of
  release and adopted unless a documented incompatibility exists.
- Next.js and AI SDK MUST be listed as production dependencies.
  Version pinning to an outdated major version without a documented
  exception is a constitution violation.

**Rationale**: Standardizing on Next.js provides a unified full-stack
framework (SSR, API routes, middleware) that aligns with the
multi-tenant, security-first architecture. The AI SDK provides a
vendor-neutral abstraction over LLM providers, reinforcing Principle V
(Pluggable Architecture) for the AI integration layer.

## Licensing & Contribution Requirements

This project is licensed under the **Apache License, Version 2.0**.

- The `NOTICE` file in the repository root MUST be preserved and
  updated when new copyright holders contribute.
- Every source file MUST include the Apache 2.0 boilerplate license
  header:

```
// Copyright 2026 jem-sec-attest contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
// either express or implied. See the License for the specific
// language governing permissions and limitations under the License.
```

- Contributors MUST NOT introduce dependencies with licenses
  incompatible with Apache 2.0 (e.g., AGPL, GPL without linking
  exception) without explicit maintainer approval.

## Development Workflow

- No feature work starts without a specification. Specifications
  define **what** and **why**, with acceptance criteria.
- Implementation plans define **how**. Plans MUST reference the
  specification and pass a Constitution Check before design work
  proceeds.
- Tasks are derived from plans via the Spec Kit workflow. Tasks MUST
  NOT be invented ad-hoc outside the spec-plan-task pipeline.
- The Spec Kit workflow (`/speckit.specify` -> `/speckit.plan` ->
  `/speckit.tasks`) MUST be followed strictly for all feature work.

## Governance

- This constitution is the highest-authority document for project
  decisions. Where other documents conflict, this constitution
  prevails.
- Amendments require: (1) a pull request with the proposed change,
  (2) description of impact on existing features and templates,
  (3) approval from at least one maintainer.
- All pull requests and code reviews MUST verify compliance with
  the principles above. Violations MUST be resolved before merge.
- Constitution versioning follows Semantic Versioning:
  - **MAJOR**: Principle removal or backward-incompatible
    redefinition.
  - **MINOR**: New principle added or existing principle materially
    expanded.
  - **PATCH**: Clarifications, wording fixes, non-semantic
    refinements.

**Version**: 1.1.0 | **Ratified**: 2026-02-16 | **Last Amended**: 2026-02-17

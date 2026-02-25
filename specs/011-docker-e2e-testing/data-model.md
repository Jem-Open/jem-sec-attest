# Data Model: Docker Local Environment & E2E Testing

**Feature**: 011-docker-e2e-testing
**Date**: 2026-02-23

This feature is primarily infrastructure — it does not introduce new persistent data entities. The entities below represent the configuration objects and runtime constructs central to the feature.

---

## Configuration Entities

### DexStaticUser

Defined in `docker/dex/config.yaml` under `staticPasswords`. This is the test user record held by the Dex IDP.

| Field | Type | Example | Notes |
|---|---|---|---|
| `email` | string | `alice@acme.com` | Used as OIDC `email` claim; must be unique |
| `hash` | string | `$2a$10$...` | bcrypt hash of the test user's password |
| `username` | string | `alice` | Used as OIDC `name` claim |
| `userID` | string | `acme-test-001` | Used as OIDC `sub` claim; stable identifier |

**Constraints**:
- Only one test user is required for initial E2E coverage (employee role)
- Password hash is bcrypt; generation documented in quickstart
- The `userID` must be stable across container restarts (in-memory Dex) — a new container will have no session state, but the `sub` claim will be the same for the same user

### DexStaticClient

Defined in `docker/dex/config.yaml` under `staticClients`.

| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | string | `jem-app` | Must match `ACME_OIDC_CLIENT_ID` env var |
| `secret` | string | `<min 32 chars>` | Must match `ACME_OIDC_CLIENT_SECRET` env var |
| `redirectURIs` | string[] | `["http://localhost:3000/api/auth/acme-corp/callback"]` | Exact match enforced by Dex |
| `name` | string | `JEM Attestation (local)` | Display label in Dex UI |

**Constraints**:
- `redirectURIs` must exactly match the `ACME_OIDC_REDIRECT_URI` env var injected into the app container
- Secret minimum length: 32 characters (matches `SESSION_SECRET` policy)

### TenantOIDCConfig (extension to acme-corp.yaml)

New fields added to `config/tenants/acme-corp.yaml` under `settings.auth.oidc`.

| Field | Type | Env Var | Docker Value |
|---|---|---|---|
| `issuerUrl` | URI string | `ACME_OIDC_ISSUER_URL` | `http://dex:5556/dex` |
| `clientId` | string | `ACME_OIDC_CLIENT_ID` | `jem-app` |
| `clientSecret` | env var ref | `ACME_OIDC_CLIENT_SECRET` | `${ACME_OIDC_CLIENT_SECRET}` |
| `redirectUri` | URI string | `ACME_OIDC_REDIRECT_URI` | `http://localhost:3000/api/auth/acme-corp/callback` |
| `scopes` | string[] | — | `["openid", "profile", "email"]` |

**Note on `dex:5556` vs `localhost:5556`**: The OIDC spec requires that the `iss` claim in every token exactly matches the issuer URL the client was configured with. Because the app container resolves `dex` via Docker's internal DNS, the issuer must be `http://dex:5556/dex` — not `http://localhost:5556/dex`. To make that hostname resolvable from the host machine as well (so the browser can complete the redirect), a `/etc/hosts` entry (`127.0.0.1 dex`) is required on the developer's machine. This design choice is captured in research Decision 2.

---

## Runtime Entities

### HealthResponse

Response body for `GET /api/health`.

| Field | Type | Description |
|---|---|---|
| `status` | `"healthy"` \| `"unhealthy"` | Application status |
| `timestamp` | ISO 8601 string | Server time at response |
| `uptime` | number (seconds) | Process uptime via `process.uptime()` |

HTTP status codes: `200` (healthy), `503` (unhealthy).

### OIDCTokenClaims (issued by Dex for test users)

The claims the app receives in the ID token after OIDC authentication.

| Claim | Source | Example |
|---|---|---|
| `sub` | Dex `userID` field | `acme-test-001` |
| `email` | Dex `email` field | `alice@acme.com` |
| `name` | Dex `username` field | `alice` |
| `email_verified` | Auto-set by Dex local connector | `true` |
| `iss` | Dex issuer config | `http://dex:5556/dex` |
| `aud` | Dex client ID | `jem-app` |

No custom claims. Role assignment happens via the intake questionnaire, not from the OIDC token.

---

## Docker Service Topology

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose Network: jem_local                  │
│                                                     │
│  ┌──────────────┐    ┌──────────────┐              │
│  │   postgres   │    │     dex      │              │
│  │  port 5432   │    │  port 5556   │              │
│  │  (internal)  │    │  port 5558   │              │
│  └──────┬───────┘    └──────┬───────┘              │
│         │                   │                       │
│         ▼                   ▼                       │
│  ┌──────────────────────────────────────────────┐   │
│  │                  app                         │   │
│  │             port 3000                        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │                   │                   │
    5432 (unused       5556 → host        3000 → host
    from host)         5558 → host
```

| Service | Image | Ports (host:container) | Health Check |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | none exposed to host | `pg_isready` on `5432` |
| `dex` | `dexidp/dex:v2.37.0` | `5556:5556`, `5558:5558` | `GET /healthz/ready` on `5558` |
| `app` | Built from `Dockerfile` | `3000:3000` | `GET /api/health` on `3000` |

Startup order: `postgres` (healthy) → `dex` (healthy) → `app`

---

## File Tree (this feature's additions)

```text
root/
├── Dockerfile                              # new — multi-stage Next.js standalone build
├── .dockerignore                           # new — build context exclusions
├── docker/
│   ├── compose.yml                         # new — full stack orchestration
│   └── dex/
│       └── config.yaml                     # new — Dex IDP with test user and client
├── next.config.ts                          # modified — add output: "standalone"
├── playwright.config.ts                    # new — Playwright CLI configuration
├── app/
│   └── api/
│       └── health/
│           └── route.ts                    # new — health check endpoint
├── config/
│   └── tenants/
│       └── acme-corp.yaml                  # modified — add auth.oidc section
├── tests/
│   └── e2e/
│       ├── .auth/                          # gitignored — stored auth state
│       │   └── user.json                   # generated at runtime by auth.setup.ts
│       ├── fixtures/
│       │   └── auth.ts                     # new — authenticated page fixture
│       ├── auth.setup.ts                   # new — global OIDC auth setup
│       ├── journey.spec.ts                 # new — full user journey test
│       └── tsconfig.json                   # new — e2e TypeScript config
├── .env.docker.example                     # new — Docker-specific env var template
└── .env.example                            # modified — add ACME_OIDC_* vars
```

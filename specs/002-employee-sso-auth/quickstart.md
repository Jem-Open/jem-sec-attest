# Quickstart: Employee SSO Authentication

This guide walks through configuring a tenant for OIDC-based employee sign-in.

## Prerequisites

- Node.js 20+
- An OIDC-compliant Identity Provider (e.g., Okta, Azure AD, Google Workspace, Keycloak)
- A tenant configured in the platform (see 001-multi-tenant-config)

## 1. Register an OIDC Application with Your IdP

In your IdP's admin console, create a new application with:

- **Application type**: Web application
- **Grant type**: Authorization Code
- **Redirect URI**: `https://<tenant-hostname>/api/auth/<tenant-slug>/callback`
  - Example: `https://acme.example.com/api/auth/acme-corp/callback`
- **Scopes**: `openid`, `profile`, `email`
- **Logout URL** (optional): `https://<tenant-hostname>/api/auth/<tenant-slug>/signout`

Record the following from your IdP:
- **Issuer URL** (e.g., `https://acme.okta.com`, `https://login.microsoftonline.com/<tenant-id>/v2.0`)
- **Client ID**
- **Client Secret**

## 2. Set the Client Secret as an Environment Variable

Client secrets MUST NEVER appear in configuration files. Set the secret as an environment variable:

```bash
export ACME_OIDC_CLIENT_SECRET="your-client-secret-here"
```

For production deployments, use your secrets manager or orchestrator's secrets injection (e.g., Kubernetes secrets, Docker secrets, systemd credentials).

## 3. Add OIDC Configuration to Tenant Config

Edit your tenant's YAML configuration file (e.g., `config/tenants/acme-corp.yaml`):

```yaml
# config/tenants/acme-corp.yaml
name: Acme Corporation
hostnames:
  - acme.example.com
emailDomains:
  - acme.com
settings:
  branding:
    displayName: Acme Corporation
    logoUrl: https://cdn.acme.com/logo.png
    primaryColor: "#1a73e8"
  auth:
    oidc:
      issuerUrl: https://acme.okta.com
      clientId: 0oa1bcdef2ghijk3lmno
      clientSecret: "${ACME_OIDC_CLIENT_SECRET}"
      redirectUri: https://acme.example.com/api/auth/acme-corp/callback
      scopes:
        - openid
        - profile
        - email
      logoutUrl: https://acme.okta.com/oauth2/v1/logout  # optional
    sessionTtlSeconds: 3600  # 1 hour (default)
```

### Configuration Reference

| Field | Required | Description |
|-------|----------|-------------|
| `auth.oidc.issuerUrl` | Yes | OIDC Discovery base URL for the IdP |
| `auth.oidc.clientId` | Yes | Client identifier registered with the IdP |
| `auth.oidc.clientSecret` | Yes | Environment variable reference: `${VAR_NAME}` |
| `auth.oidc.redirectUri` | Yes | Must match the redirect URI registered with the IdP |
| `auth.oidc.scopes` | Yes | Must include `openid`. Add `profile` and `email` for user claims. |
| `auth.oidc.logoutUrl` | No | IdP logout endpoint. If set, sign-out redirects here after local session destruction. |
| `auth.oidc.claimMappings` | No | Custom mapping of IdP claim names to employee fields |
| `auth.sessionTtlSeconds` | No | Session duration in seconds. Default: `3600` (1 hour). |

## 4. Set the Session Encryption Secret

The platform encrypts session cookies using a shared secret. This must be at least 32 characters:

```bash
export SESSION_SECRET="a-minimum-32-character-secret-for-iron-session-encryption"
```

Generate a secure random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Validate Configuration

Start the platform and verify the tenant configuration loads without errors:

```bash
npm run dev
```

Check for validation messages in the console. If the OIDC configuration is invalid, the system will log the validation error and disable SSO for that tenant (other tenants are unaffected).

## 6. Test the Sign-In Flow

1. Navigate to `https://acme.example.com` (or your tenant's hostname)
2. You should see a branded sign-in page with Acme Corporation's logo and a "Sign in with SSO" button
3. Click "Sign in with SSO"
4. You are redirected to the IdP's login page
5. Authenticate with your IdP credentials
6. You are redirected back to the platform and land on the tenant dashboard
7. Check the audit log for a `sign-in` event

## 7. Test Sign-Out

1. Click "Sign Out" from the dashboard
2. Your local session is destroyed
3. If `logoutUrl` is configured, you are also redirected to the IdP's logout page
4. Check the audit log for a `sign-out` event

## Security Guidance for Deployers

### Secrets Management

- **NEVER** commit client secrets to configuration files or version control
- Use environment variable substitution (`${VAR}`) in all config files
- Rotate client secrets periodically at the IdP and update environment variables
- The `SESSION_SECRET` must be consistent across all application instances in a cluster

### Network Exposure

- All auth endpoints (`/api/auth/*`) MUST be served over HTTPS
- The redirect URI registered with the IdP MUST use HTTPS
- Session cookies are set with `secure: true` and `httpOnly: true` in production

### Tenant Isolation Verification

- Sessions are bound to the tenant that created them
- Accessing a different tenant's hostname with an existing session forces re-authentication
- Cross-tenant resource access returns generic 404/403 (no information leakage)
- Test by signing into Tenant A and attempting to access Tenant B's URLs

### Monitoring

- All authentication events (sign-in, sign-out, failures) are recorded as audit events
- Monitor `auth-failure` events for patterns indicating attack attempts
- Monitor `auth-config-error` events for misconfigured tenants

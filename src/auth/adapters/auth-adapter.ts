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
 * AuthAdapter interface — pluggable authentication backend.
 * Constitution Principle V: Pluggable Architecture (OIDC now, SAML future).
 */

import type { Tenant } from "../../tenant/types.js";

export interface EmployeeClaims {
  sub: string;
  email: string;
  name: string;
  issuer: string;
}

export interface AuthSuccess {
  ok: true;
  claims: EmployeeClaims;
}

export interface AuthFailure {
  ok: false;
  reason:
    | "idp-error"
    | "state-mismatch"
    | "token-exchange-failed"
    | "missing-required-claims"
    | "tenant-mismatch";
  message: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

export interface AuthRedirect {
  redirectUrl: string;
  cookies?: Record<string, string>;
}

export interface AuthAdapter {
  initiateSignIn(request: Request, tenant: Tenant): Promise<AuthRedirect>;
  handleCallback(request: Request, tenant: Tenant): Promise<AuthResult>;
  signOut(request: Request, tenant: Tenant): Promise<AuthRedirect>;
}

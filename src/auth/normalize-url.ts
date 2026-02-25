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
 * Normalizes a request URL by replacing the bind address (0.0.0.0) with the
 * actual hostname from the Host header. This is necessary in Docker/production
 * where Next.js binds to 0.0.0.0 but the browser connects via localhost.
 */
export function normalizeRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  if (url.hostname === "0.0.0.0") {
    const hostHeader = request.headers.get("host");
    if (hostHeader) {
      try {
        const parsed = new URL(`http://${hostHeader}`);
        url.hostname = parsed.hostname;
        url.port = parsed.port;
      } catch {
        // malformed Host header — leave url unchanged
      }
    }
  }
  return url;
}

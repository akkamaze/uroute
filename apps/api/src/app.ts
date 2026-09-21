import { Elysia } from "elysia";

import { withClientAddress } from "./auth/client-address";
import type { AuthService } from "./auth/create-auth";

// Preserve Elysia's route-specific response inference for tests and mounted handlers.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createApp(
  auth?: AuthService,
  resolveAddress: (request: Request) => string | null = () => null,
) {
  const app = new Elysia()
    .onRequest(({ request, set, status }) => {
      const url = new URL(request.url);

      if (!url.pathname.startsWith("/api/")) {
        return;
      }

      set.headers["cache-control"] = "no-store";

      if (!auth) {
        return;
      }

      const host = request.headers.get("host") ?? url.host;

      if (!auth.options.baseURL.allowedHosts.includes(host)) {
        return status(403, { error: "Request host is not allowed." });
      }

      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");

        if (!origin || !auth.options.trustedOrigins.includes(origin)) {
          return status(403, { error: "Request origin is not allowed." });
        }
      }

      return undefined;
    })
    .get("/health", () => ({ status: "ok" }));

  if (!auth) {
    return app;
  }

  return app
    .mount((request) => auth.handler(withClientAddress(request, resolveAddress(request))))
    .get("/api/me", async ({ request, status }) => {
      try {
        const headers = new Headers(request.headers);

        if (!headers.has("host")) {
          headers.set("host", new URL(request.url).host);
        }

        const session = await auth.api.getSession({ headers });

        if (!session) {
          return status(401, { error: "Sign in to continue." });
        }

        return {
          user: { email: session.user.email, id: session.user.id, name: session.user.name },
        };
      } catch {
        return status(503, { error: "Account service is temporarily unavailable." });
      }
    });
}

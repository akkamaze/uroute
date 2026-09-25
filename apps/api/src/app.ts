import { Elysia } from "elysia";

import { withClientAddress } from "./auth/client-address";
import type { AuthService } from "./auth/create-auth";
import type { TripInput, TripRepository } from "./trips/repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validTripInput(value: unknown): value is TripInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const trip = value as Partial<TripInput>;
  if (
    typeof trip.id !== "string" ||
    !UUID.test(trip.id) ||
    typeof trip.name !== "string" ||
    !trip.name.trim() ||
    trip.name.length > 120 ||
    typeof trip.startDate !== "string" ||
    !DATE.test(trip.startDate) ||
    typeof trip.endDate !== "string" ||
    !DATE.test(trip.endDate)
  ) {
    return false;
  }
  const start = Date.parse(`${trip.startDate}T12:00:00Z`);
  const end = Date.parse(`${trip.endDate}T12:00:00Z`);

  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    new Date(start).toISOString().slice(0, 10) === trip.startDate &&
    new Date(end).toISOString().slice(0, 10) === trip.endDate &&
    end >= start &&
    end - start < 60 * 86_400_000
  );
}

async function sessionOwner(auth: AuthService, request: Request): Promise<string | null> {
  const headers = new Headers(request.headers);
  if (!headers.has("host")) {
    headers.set("host", new URL(request.url).host);
  }
  const session = await auth.api.getSession({ headers });

  return session?.user.id ?? null;
}

// Preserve Elysia's route-specific response inference for tests and mounted handlers.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createApp(
  auth?: AuthService,
  resolveAddress: (request: Request) => string | null = () => null,
  trips?: TripRepository,
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

  const secured = app
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

  if (!trips) {
    return secured;
  }

  return secured
    .get("/api/trips", async ({ request, status }) => {
      try {
        const ownerId = await sessionOwner(auth, request);
        if (!ownerId) {
          return status(401, { error: "Sign in to continue." });
        }
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 50 ||
          !Number.isInteger(offset) ||
          offset < 0 ||
          offset > 10_000
        ) {
          return status(400, { error: "Invalid trip page." });
        }

        return { trips: await trips.list(ownerId, limit, offset) };
      } catch {
        return status(503, { error: "Trip service is temporarily unavailable." });
      }
    })
    .get("/api/trips/:id", async ({ request, params, status }) => {
      if (!UUID.test(params.id)) {
        return status(400, { error: "Invalid trip ID." });
      }
      try {
        const ownerId = await sessionOwner(auth, request);
        if (!ownerId) {
          return status(401, { error: "Sign in to continue." });
        }
        const trip = await trips.get(ownerId, params.id);

        return trip ?? status(404, { error: "Trip not found." });
      } catch {
        return status(503, { error: "Trip service is temporarily unavailable." });
      }
    })
    .post("/api/trips", async ({ request, body, status }) => {
      if (!validTripInput(body)) {
        return status(400, { error: "Invalid trip details." });
      }
      try {
        const ownerId = await sessionOwner(auth, request);
        if (!ownerId) {
          return status(401, { error: "Sign in to continue." });
        }
        const trip = await trips.create(ownerId, body);

        return trip ?? status(409, { error: "Trip ID already belongs to different details." });
      } catch {
        return status(503, { error: "Trip service is temporarily unavailable." });
      }
    })
    .put("/api/trips/:id", async ({ request, params, body, status }) => {
      const input: unknown =
        typeof body === "object" && body !== null ? { ...body, id: params.id } : null;
      if (!UUID.test(params.id) || !validTripInput(input)) {
        return status(400, { error: "Invalid trip details." });
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("version" in body) ||
        typeof body.version !== "string" ||
        !/^[1-9]\d{0,17}$/.test(body.version)
      ) {
        return status(400, { error: "A valid trip version is required." });
      }
      try {
        const ownerId = await sessionOwner(auth, request);
        if (!ownerId) {
          return status(401, { error: "Sign in to continue." });
        }
        const result = await trips.update(ownerId, params.id, body.version, input);
        if (result === "not-found") {
          return status(404, { error: "Trip not found." });
        }
        if (result === "conflict") {
          return status(409, { error: "Trip changed on another device." });
        }

        return result;
      } catch {
        return status(503, { error: "Trip service is temporarily unavailable." });
      }
    });
}

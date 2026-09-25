import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";

import { createApp } from "../src/app";
import { createAuth, createAuthOptions, type AuthService } from "../src/auth/create-auth";
import type { AuthConfig } from "../src/config";
import type { TripInput, TripRecord, TripRepository } from "../src/trips/repository";

const config: AuthConfig = {
  baseURL: "http://localhost:3001",
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  production: false,
  secret: "test-only-auth-secret-29d86050a8ba4e2fbb",
  trustedOrigins: ["http://localhost:5180"],
};
const ID = "2f0802ba-d889-4493-8a1d-87b07b92f021";
let database: Database;
let auth: AuthService;
let trips: MemoryTripRepository;

class MemoryTripRepository implements TripRepository {
  private readonly records = new Map<string, TripRecord & { ownerId: string }>();

  list(ownerId: string, limit: number, offset: number): Promise<TripRecord[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter((trip) => trip.ownerId === ownerId)
        .slice(offset, offset + limit),
    );
  }

  get(ownerId: string, id: string): Promise<TripRecord | null> {
    const trip = this.records.get(id);

    return Promise.resolve(trip?.ownerId === ownerId ? trip : null);
  }

  create(ownerId: string, input: TripInput): Promise<TripRecord | null> {
    const known = this.records.get(input.id);
    if (known) {
      return Promise.resolve(
        known.ownerId === ownerId &&
          known.name === input.name &&
          known.startDate === input.startDate &&
          known.endDate === input.endDate
          ? known
          : null,
      );
    }
    const trip = { ...input, ownerId, version: "1", createdAt: "now", updatedAt: "now" };
    this.records.set(input.id, trip);

    return Promise.resolve(trip);
  }

  async update(
    ownerId: string,
    id: string,
    version: string,
    changes: Omit<TripInput, "id">,
  ): Promise<TripRecord | "not-found" | "conflict"> {
    const known = await this.get(ownerId, id);
    if (!known) {
      return "not-found";
    }
    if (known.version !== version) {
      return "conflict";
    }
    const next = { ...known, ...changes, version: String(Number(version) + 1), ownerId };
    this.records.set(id, next);

    return next;
  }
}

beforeEach(async () => {
  database = new Database(":memory:");
  await (await getMigrations(createAuthOptions(database, config))).runMigrations();
  auth = createAuth(database, config);
  trips = new MemoryTripRepository();
});

afterEach(() => database.close());

async function cookie(email: string): Promise<string> {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { email, emailVerified: true, name: "Traveler" },
    { method: "oauth", oauth: { profile: {}, providerId: "google" } },
  );
  const session = await context.internalAdapter.createSession(user.id, false);
  if (!session) {
    throw new Error("Could not create test session.");
  }
  const token = `${session.token}.${await makeSignature(session.token, config.secret)}`;

  return `${getCookies(auth.options).sessionToken.name}=${encodeURIComponent(token)}`;
}

function request(
  path: string,
  method = "GET",
  body?: unknown,
  session?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (session) {
    headers.cookie = session;
  }
  if (method !== "GET") {
    headers.origin = config.trustedOrigins[0] ?? "http://localhost:5180";
    headers["content-type"] = "application/json";
  }

  return createApp(auth, undefined, trips).handle(
    new Request(config.baseURL + path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

const input: TripInput = {
  id: ID,
  name: "Kanto",
  startDate: "2026-09-27",
  endDate: "2026-10-01",
};

test("trip endpoints require a signed session and owner scope", async () => {
  const owner = await cookie("owner@example.test");
  const other = await cookie("other@example.test");

  expect((await request("/api/trips")).status).toBe(401);
  expect((await request("/api/trips", "POST", input)).status).toBe(401);
  expect((await request("/api/trips", "POST", input, owner)).status).toBe(200);
  expect((await request(`/api/trips/${ID}`, "GET", undefined, other)).status).toBe(404);
  expect(
    await request("/api/trips", "GET", undefined, other).then((response) => response.json()),
  ).toEqual({ trips: [] });
  expect((await request(`/api/trips/${ID}`, "PUT", { ...input, version: "1" }, other)).status).toBe(
    404,
  );
});

test("trip creation is idempotent and updates require a current version", async () => {
  const owner = await cookie("owner@example.test");
  expect((await request("/api/trips", "POST", input, owner)).status).toBe(200);
  expect((await request("/api/trips", "POST", input, owner)).status).toBe(200);
  expect((await request("/api/trips", "POST", { ...input, name: "Changed" }, owner)).status).toBe(
    409,
  );
  const update = await request(
    `/api/trips/${ID}`,
    "PUT",
    { ...input, name: "Tokyo", version: "1" },
    owner,
  );
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({ name: "Tokyo", version: "2" });
  expect((await request(`/api/trips/${ID}`, "PUT", { ...input, version: "1" }, owner)).status).toBe(
    409,
  );
});

test("trip input and page bounds reject malformed data", async () => {
  const owner = await cookie("owner@example.test");
  expect(
    (await request("/api/trips", "POST", { ...input, startDate: "2026-02-31" }, owner)).status,
  ).toBe(400);
  expect(
    (await request("/api/trips", "POST", { ...input, endDate: "2027-01-01" }, owner)).status,
  ).toBe(400);
  expect((await request("/api/trips?limit=1000", "GET", undefined, owner)).status).toBe(400);
  expect((await request(`/api/trips/not-a-uuid`, "GET", undefined, owner)).status).toBe(400);
});

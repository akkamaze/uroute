import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";

import { createApp } from "../src/app";
import { createAuth, createAuthOptions, type AuthService } from "../src/auth/create-auth";
import type { AuthConfig } from "../src/config";
import type { EntryInput, EntryPage, EntryRecord, TripEntryRepository } from "../src/trips/entries";
import type { DraftVisit, TripDraft, TripDraftRepository } from "../src/trips/drafts";
import type { TripInput, TripRecord, TripRepository } from "../src/trips/repository";
import type { PlanDay, PlanPlace, TripPlanRepository } from "../src/trips/plan";

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
let entries: MemoryEntryRepository;
let drafts: MemoryDraftRepository;
let plans: MemoryPlanRepository;

class MemoryPlanRepository implements TripPlanRepository {
  private readonly records = new Map<string, PlanDay["entries"]>();
  private readonly places = new Map<string, PlanPlace>();
  private readonly visits = new Map<string, string>();

  constructor(private readonly trips: MemoryTripRepository) {}

  async day(ownerId: string, tripId: string, day: string): Promise<PlanDay | null> {
    const trip = await this.trips.get(ownerId, tripId);
    if (!trip) {
      return null;
    }

    return {
      version: trip.version,
      entries: (this.records.get(`${tripId}:${day}`) ?? []).map((entry) => ({
        ...entry,
        place: entry.placeId ? (this.places.get(`${tripId}:${entry.placeId}`) ?? null) : null,
        visitedAt: this.visits.get(`${tripId}:${entry.sourceKey}`) ?? null,
      })),
    };
  }

  async setVisited(
    ownerId: string,
    tripId: string,
    sourceKey: string,
    visited: boolean,
  ): Promise<{ sourceKey: string; visitedAt: string | null } | null> {
    if (!(await this.trips.get(ownerId, tripId))) {
      return null;
    }
    const key = `${tripId}:${sourceKey}`;
    if (visited) {
      this.visits.set(key, this.visits.get(key) ?? "2026-09-27T01:00:00Z");
    } else {
      this.visits.delete(key);
    }

    return { sourceKey, visitedAt: this.visits.get(key) ?? null };
  }

  async upsertPlace(ownerId: string, tripId: string, place: PlanPlace): Promise<PlanPlace | null> {
    if (!(await this.trips.get(ownerId, tripId))) {
      return null;
    }
    this.places.set(`${tripId}:${place.sourceKey}`, place);

    return place;
  }

  async replaceDay(
    ownerId: string,
    tripId: string,
    day: string,
    version: string,
    input: readonly EntryInput[],
  ): Promise<PlanDay | "not-found" | "conflict" | "out-of-range"> {
    const trip = await this.trips.get(ownerId, tripId);
    if (!trip) {
      return "not-found";
    }
    if (trip.version !== version) {
      return "conflict";
    }
    if (day < trip.startDate || day > trip.endDate || input.some((row) => row.day !== day)) {
      return "out-of-range";
    }
    const updated = await this.trips.update(ownerId, tripId, version, trip);
    if (typeof updated === "string") {
      return "conflict";
    }
    const rows = input.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      place: null,
      visitedAt: null,
    }));
    this.records.set(`${tripId}:${day}`, rows);

    return { version: updated.version, entries: rows };
  }
}

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

class MemoryEntryRepository implements TripEntryRepository {
  private readonly records = new Map<string, EntryRecord[]>();

  constructor(private readonly trips: MemoryTripRepository) {}

  async list(
    ownerId: string,
    tripId: string,
    day: string | null,
    limit: number,
    offset: number,
  ): Promise<EntryPage | null> {
    const trip = await this.trips.get(ownerId, tripId);
    if (!trip) {
      return null;
    }

    return {
      entries: (this.records.get(tripId) ?? [])
        .filter((entry) => day === null || entry.day === day)
        .slice(offset, offset + limit),
      tripVersion: trip.version,
    };
  }

  async replace(
    ownerId: string,
    tripId: string,
    version: string,
    input: readonly EntryInput[],
  ): Promise<EntryPage | "not-found" | "conflict" | "out-of-range"> {
    const trip = await this.trips.get(ownerId, tripId);
    if (!trip) {
      return "not-found" as const;
    }
    if (trip.version !== version) {
      return "conflict" as const;
    }
    if (input.some((entry) => entry.day < trip.startDate || entry.day > trip.endDate)) {
      return "out-of-range" as const;
    }
    const updated = await this.trips.update(ownerId, tripId, version, trip);
    if (typeof updated === "string") {
      return "conflict" as const;
    }
    const saved = input.map((entry) => ({ ...entry, id: crypto.randomUUID() }));
    this.records.set(tripId, saved);

    return { entries: saved, tripVersion: updated.version };
  }
}

class MemoryDraftRepository implements TripDraftRepository {
  private readonly records = new Map<string, TripDraft>();

  constructor(private readonly trips: MemoryTripRepository) {}

  async get(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
  ): Promise<TripDraft | null> {
    if (!(await this.trips.get(ownerId, tripId))) {
      return null;
    }

    return this.records.get(`${tripId}:${day}:${variant}`) ?? null;
  }

  async put(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    baseVersion: string,
    expectedRevision: string | null,
    visits: readonly DraftVisit[],
  ): Promise<TripDraft | "not-found" | "out-of-range" | "conflict"> {
    const trip = await this.trips.get(ownerId, tripId);
    if (!trip) {
      return "not-found";
    }
    if (day < trip.startDate || day > trip.endDate) {
      return "out-of-range";
    }
    if (trip.version !== baseVersion) {
      return "conflict";
    }
    const key = `${tripId}:${day}:${variant}`;
    const current = this.records.get(key);
    if ((current?.revision ?? null) !== expectedRevision) {
      return "conflict";
    }
    const draft: TripDraft = {
      day,
      variant,
      baseVersion,
      revision: String(Number(current?.revision ?? 0) + 1),
      visits: visits.map((visit) => ({ ...visit })),
      updatedAt: "now",
    };
    this.records.set(key, draft);

    return draft;
  }

  async delete(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    expectedRevision: string,
  ): Promise<"deleted" | "not-found" | "conflict"> {
    const current = await this.get(ownerId, tripId, day, variant);
    if (!current) {
      return "not-found";
    }
    if (current.revision !== expectedRevision) {
      return "conflict";
    }
    this.records.delete(`${tripId}:${day}:${variant}`);

    return "deleted";
  }
}

beforeEach(async () => {
  database = new Database(":memory:");
  await (await getMigrations(createAuthOptions(database, config))).runMigrations();
  auth = createAuth(database, config);
  trips = new MemoryTripRepository();
  entries = new MemoryEntryRepository(trips);
  drafts = new MemoryDraftRepository(trips);
  plans = new MemoryPlanRepository(trips);
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

  return createApp(auth, undefined, trips, entries, drafts, undefined, plans).handle(
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

const entry: EntryInput = {
  sourceKey: "sheet:D1:3",
  day: "2026-09-27",
  variant: "A",
  position: 3,
  kind: "place",
  title: "Senso-ji",
  timeLabel: "09:00",
  detail: "Morning visit",
  area: "Asakusa",
  placeId: null,
};

test("plan days are owner-scoped and save one day with version checks", async () => {
  const owner = await cookie("plan-owner@example.test");
  const other = await cookie("plan-other@example.test");
  await request("/api/trips", "POST", input, owner);
  const path = `/api/trips/${ID}/plan?day=2026-09-27`;
  expect((await request(path)).status).toBe(401);
  expect((await request(path, "GET", undefined, other)).status).toBe(404);
  expect(await (await request(path, "GET", undefined, owner)).json()).toMatchObject({
    trip: input,
    version: "1",
    entries: [],
  });
  const saved = await request(path, "PUT", { version: "1", entries: [entry] }, owner);
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ version: "2", entries: [entry] });
  expect((await request(path, "PUT", { version: "1", entries: [] }, owner)).status).toBe(409);
  expect(
    (
      await request(
        path,
        "PUT",
        { version: "2", entries: [{ ...entry, day: "2026-09-28" }] },
        owner,
      )
    ).status,
  ).toBe(400);
  expect(
    (await request(`/api/trips/${ID}/plan?day=2026-10-02`, "GET", undefined, owner)).status,
  ).toBe(400);
  expect(
    (await request(`/api/trips/${ID}/plan?day=2026-09-28`, "GET", undefined, owner)).status,
  ).toBe(200);
});

test("plan pin metadata is owner-scoped and joined to the saved day", async () => {
  const owner = await cookie("pin-owner@example.test");
  const other = await cookie("pin-other@example.test");
  await request("/api/trips", "POST", input, owner);
  const place: PlanPlace = {
    sourceKey: "osm-1",
    name: "Temple",
    latitude: 35.7,
    longitude: 139.7,
    category: "temple",
    imageUrl: null,
    notes: null,
  };
  const path = `/api/trips/${ID}/places`;
  expect((await request(path, "POST", place, other)).status).toBe(404);
  expect((await request(path, "POST", place, owner)).status).toBe(200);
  await request(
    `/api/trips/${ID}/plan?day=2026-09-27`,
    "PUT",
    {
      version: "1",
      entries: [{ ...entry, placeId: place.sourceKey }],
    },
    owner,
  );
  const plan = await request(`/api/trips/${ID}/plan?day=2026-09-27`, "GET", undefined, owner);
  expect(await plan.json()).toMatchObject({ entries: [{ place }] });
});

test("visit status is owner-scoped and survives replacing the day plan", async () => {
  const owner = await cookie("visit-owner@example.test");
  const other = await cookie("visit-other@example.test");
  await request("/api/trips", "POST", input, owner);
  const day = `/api/trips/${ID}/plan?day=2026-09-27`;
  await request(day, "PUT", { version: "1", entries: [entry] }, owner);
  const path = `/api/trips/${ID}/visits`;
  expect(
    (await request(path, "PUT", { sourceKey: entry.sourceKey, visited: true }, other)).status,
  ).toBe(404);
  expect((await request(path, "PUT", { sourceKey: "", visited: true }, owner)).status).toBe(400);
  expect((await request(path, "PUT", { sourceKey: entry.sourceKey }, owner)).status).toBe(400);
  const marked = await request(path, "PUT", { sourceKey: entry.sourceKey, visited: true }, owner);
  expect(marked.status).toBe(200);
  const visitedAt = ((await marked.json()) as { visitedAt: string }).visitedAt;
  expect(visitedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  await request(day, "PUT", { version: "2", entries: [{ ...entry, position: 2 }] }, owner);
  expect(await (await request(day, "GET", undefined, owner)).json()).toMatchObject({
    entries: [{ sourceKey: entry.sourceKey, visitedAt }],
  });
  await request(path, "PUT", { sourceKey: entry.sourceKey, visited: false }, owner);
  expect(await (await request(day, "GET", undefined, owner)).json()).toMatchObject({
    entries: [{ sourceKey: entry.sourceKey, visitedAt: null }],
  });
});

test("daily entries preserve order, owner scope, and trip version", async () => {
  const owner = await cookie("owner@example.test");
  const other = await cookie("other@example.test");
  expect((await request("/api/trips", "POST", input, owner)).status).toBe(200);
  const result = await request(
    `/api/trips/${ID}/entries`,
    "PUT",
    { version: "1", entries: [entry, { ...entry, sourceKey: "sheet:D1:4", position: 4 }] },
    owner,
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    tripVersion: "2",
    entries: [entry, { ...entry, sourceKey: "sheet:D1:4", position: 4 }],
  });
  expect((await request(`/api/trips/${ID}/entries`, "GET", undefined, other)).status).toBe(404);
  const page = await request(`/api/trips/${ID}/entries?day=2026-09-27`, "GET", undefined, owner);
  expect(await page.json()).toMatchObject({
    tripVersion: "2",
    entries: [entry, { ...entry, sourceKey: "sheet:D1:4", position: 4 }],
  });
  expect(
    (await request(`/api/trips/${ID}/entries`, "PUT", { version: "1", entries: [] }, owner)).status,
  ).toBe(409);
});

test("entry batch rejects duplicate keys, bad bounds, and days outside the trip", async () => {
  const owner = await cookie("owner@example.test");
  expect((await request("/api/trips", "POST", input, owner)).status).toBe(200);
  const path = `/api/trips/${ID}/entries`;
  expect(
    (await request(path, "PUT", { version: "1", entries: [entry, entry] }, owner)).status,
  ).toBe(400);
  expect(
    (await request(path, "PUT", { version: "1", entries: [{ ...entry, position: -1 }] }, owner))
      .status,
  ).toBe(400);
  expect(
    (
      await request(
        path,
        "PUT",
        { version: "1", entries: [{ ...entry, day: "2026-10-02" }] },
        owner,
      )
    ).status,
  ).toBe(400);
  expect((await request(`${path}?limit=501`, "GET", undefined, owner)).status).toBe(400);
});

test("drafts are owner-scoped, revisioned and independent from the saved plan", async () => {
  const owner = await cookie("owner@example.test");
  const other = await cookie("other@example.test");
  await request("/api/trips", "POST", input, owner);
  const path = `/api/trips/${ID}/drafts/2026-09-27/A`;
  const visits = [{ placeId: "stop-1", time: "09:30", notes: "Arrive early" }];
  expect((await request(path, "GET", undefined, other)).status).toBe(404);
  expect(
    (await request(path, "PUT", { baseVersion: "1", revision: null, visits }, other)).status,
  ).toBe(404);
  const first = await request(path, "PUT", { baseVersion: "1", revision: null, visits }, owner);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ revision: "1", visits });
  expect(
    (await request(path, "PUT", { baseVersion: "1", revision: null, visits }, owner)).status,
  ).toBe(409);
  const second = await request(
    path,
    "PUT",
    { baseVersion: "1", revision: "1", visits: [{ ...visits[0]!, notes: "Updated" }] },
    owner,
  );
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({ revision: "2" });
  expect(
    await request(`/api/trips/${ID}`, "GET", undefined, owner).then((response) => response.json()),
  ).toMatchObject({ version: "1" });
  expect((await request(`${path}?revision=1`, "DELETE", undefined, owner)).status).toBe(409);
  expect((await request(`${path}?revision=2`, "DELETE", undefined, owner)).status).toBe(200);
  expect((await request(path, "GET", undefined, owner)).status).toBe(404);
});

test("draft validation rejects malformed visits and stale saved-plan versions", async () => {
  const owner = await cookie("owner@example.test");
  await request("/api/trips", "POST", input, owner);
  const path = `/api/trips/${ID}/drafts/2026-09-27/A`;
  const visit = { placeId: "stop-1", time: "09:30", notes: "" };
  expect(
    (
      await request(
        path,
        "PUT",
        { baseVersion: "1", revision: null, visits: [visit, visit] },
        owner,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        path,
        "PUT",
        { baseVersion: "1", revision: null, visits: [{ ...visit, time: "25:00" }] },
        owner,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        `/api/trips/${ID}/drafts/2026-10-02/A`,
        "PUT",
        { baseVersion: "1", revision: null, visits: [] },
        owner,
      )
    ).status,
  ).toBe(400);
  await request(`/api/trips/${ID}`, "PUT", { ...input, version: "1" }, owner);
  expect(
    (await request(path, "PUT", { baseVersion: "1", revision: null, visits: [] }, owner)).status,
  ).toBe(409);
});

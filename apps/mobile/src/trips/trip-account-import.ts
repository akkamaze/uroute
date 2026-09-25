import { loadImportedPlaces, loadImportedVisits } from "../imports/place-library";
import { loadItinerary } from "../imports/itinerary-sheet";
import { buildCreatedPlanRows } from "../plan/created-plan-rows";
import { tripDays, type CreatedTrip } from "./trip-store";

interface AccountTrip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  version: string;
}

interface AccountEntry {
  sourceKey: string;
  day: string;
  variant: string;
  position: number;
  kind: "place" | "transport" | "note";
  title: string;
  timeLabel: string;
  detail: string;
  area: string;
  placeId: string | null;
}

class AccountImportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(30_000),
      ...init,
    });
  } catch {
    throw new AccountImportError(
      "Could not reach your account. This trip is still on this device.",
      0,
    );
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new AccountImportError("Sign in again before importing this trip.", 401);
    }
    if (response.status === 409) {
      throw new AccountImportError(
        "This trip changed on your account. Nothing was overwritten.",
        409,
      );
    }
    throw new AccountImportError(
      "Could not import this trip. It is still safe on this device.",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export async function listAccountTripIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; offset <= 10_000; offset += 50) {
    const page = await request<{ trips: AccountTrip[] }>(`/api/trips?limit=50&offset=${offset}`);
    page.trips.forEach((trip) => ids.add(trip.id));
    if (page.trips.length < 50) {
      break;
    }
  }

  return ids;
}

function validEntry(entry: AccountEntry): boolean {
  return (
    entry.sourceKey.length <= 240 &&
    entry.title.length > 0 &&
    entry.title.length <= 500 &&
    entry.timeLabel.length <= 80 &&
    entry.detail.length <= 5_000 &&
    entry.area.length <= 160 &&
    (entry.placeId === null || entry.placeId.length <= 240)
  );
}

async function localEntries(trip: CreatedTrip): Promise<AccountEntry[]> {
  const [points, itinerary, visits] = await Promise.all([
    loadImportedPlaces(),
    loadItinerary(trip.id),
    loadImportedVisits(),
  ]);
  const result: AccountEntry[] = [];
  for (const { day } of tripDays(trip)) {
    const variants = new Set([
      "A",
      ...itinerary.filter((entry) => entry.day === day).map((entry) => entry.variant),
    ]);
    for (const variant of variants) {
      const key = `${day}:${variant}`;
      const rows = buildCreatedPlanRows(
        trip.id,
        day,
        variant,
        points,
        itinerary,
        visits,
        trip.rowOrder?.[key],
        trip.rowHidden?.[key],
        trip.rowEdits?.[key],
      );
      rows.forEach((row, position) => {
        result.push({
          sourceKey: `${day}:${variant}:${row.id}`,
          day,
          variant,
          position,
          kind: row.kind,
          title: row.title,
          timeLabel: row.time,
          detail: row.detail,
          area: row.area,
          placeId: row.point?.id ?? row.entry?.placeId ?? null,
        });
      });
    }
  }
  if (
    result.length > 2_000 ||
    new Set(result.map((entry) => entry.sourceKey)).size !== result.length ||
    result.some((entry) => !validEntry(entry))
  ) {
    throw new AccountImportError(
      "This plan has entries the current account API cannot store. Nothing was changed.",
      400,
    );
  }

  return result;
}

async function remoteEntries(
  tripId: string,
): Promise<{ entries: AccountEntry[]; version: string }> {
  const entries: AccountEntry[] = [];
  let version = "";
  for (let offset = 0; offset <= 10_000; offset += 500) {
    const page = await request<{ entries: AccountEntry[]; tripVersion: string }>(
      `/api/trips/${encodeURIComponent(tripId)}/entries?limit=500&offset=${offset}`,
    );
    if (version && page.tripVersion !== version) {
      throw new AccountImportError("This trip changed during import. Please retry.", 409);
    }
    version = page.tripVersion;
    entries.push(...page.entries);
    if (page.entries.length < 500) {
      break;
    }
  }

  return { entries, version };
}

function sameEntries(left: readonly AccountEntry[], right: readonly AccountEntry[]): boolean {
  const select = (entry: AccountEntry): AccountEntry => ({
    sourceKey: entry.sourceKey,
    day: entry.day,
    variant: entry.variant,
    position: entry.position,
    kind: entry.kind,
    title: entry.title,
    timeLabel: entry.timeLabel,
    detail: entry.detail,
    area: entry.area,
    placeId: entry.placeId,
  });

  return JSON.stringify(left.map(select)) === JSON.stringify(right.map(select));
}

export async function importLocalTripToAccount(trip: CreatedTrip): Promise<number> {
  // Validate the whole local snapshot before creating a server-side trip.
  const entries = await localEntries(trip);
  const saved = await request<AccountTrip>("/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
    }),
  });
  const remote = await remoteEntries(saved.id);
  if (sameEntries(remote.entries, entries)) {
    return entries.length;
  }
  if (remote.entries.length > 0) {
    throw new AccountImportError(
      "This trip already has a different itinerary on your account. Nothing was overwritten.",
      409,
    );
  }
  if (entries.length === 0) {
    return 0;
  }
  await request(`/api/trips/${encodeURIComponent(saved.id)}/entries`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: remote.version, entries }),
  });

  return entries.length;
}

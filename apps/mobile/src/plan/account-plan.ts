import type { ImportedPoint } from "../imports/parse-place-file";
import { refreshCachedAccountPlanDay } from "./account-plan-cache";
import type { ItineraryEntry } from "../imports/itinerary-sheet";
import { isPlaceCategory, type PlaceCategory } from "../places/place-category";
import { effectivePlaceCategory } from "../places/place-category";
import type { CreatedTrip } from "../trips/trip-store";

export interface AccountTrip extends CreatedTrip {
  version: string;
}

export interface AccountPlanEntry {
  id: string;
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
  place: {
    sourceKey: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    category: string | null;
    imageUrl: string | null;
    notes: string | null;
  } | null;
}

export interface AccountPlanDay {
  trip: AccountTrip;
  version: string;
  entries: AccountPlanEntry[];
}

export function accountEntryInput(entry: AccountPlanEntry): Omit<AccountPlanEntry, "id" | "place"> {
  return {
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
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(30_000),
    ...init,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? "This trip changed on another device. Reload before saving."
        : `Account plan request failed (${response.status}).`,
    );
  }

  return response.json() as Promise<T>;
}

export async function loadAccountTrips(): Promise<AccountTrip[]> {
  const result = await request<{ trips: AccountTrip[] }>("/api/trips?limit=50");

  return result.trips;
}

export function createAccountTrip(trip: CreatedTrip): Promise<AccountTrip> {
  return request("/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trip),
  });
}

export function loadAccountTrip(id: string): Promise<AccountTrip> {
  return request(`/api/trips/${encodeURIComponent(id)}`);
}

export function updateAccountTrip(
  trip: AccountTrip,
  changes: Pick<CreatedTrip, "name" | "startDate" | "endDate">,
): Promise<AccountTrip> {
  return request(`/api/trips/${encodeURIComponent(trip.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...changes, version: trip.version }),
  });
}

export function loadAccountPlanDay(tripId: string, day: string): Promise<AccountPlanDay> {
  return request(`/api/trips/${encodeURIComponent(tripId)}/plan?day=${encodeURIComponent(day)}`);
}

export async function addAccountPlanPlace(
  tripId: string,
  day: string,
  point: ImportedPoint,
): Promise<"added" | "duplicate"> {
  const plan = await loadAccountPlanDay(tripId, day);
  if (plan.entries.some((entry) => entry.placeId === point.id)) {
    return "duplicate";
  }
  await request(`/api/trips/${encodeURIComponent(tripId)}/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceKey: point.id,
      name: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
      category: effectivePlaceCategory(point),
      imageUrl: point.mediaReferences.find((url) => /^https:\/\//.test(url)) ?? null,
      notes: point.description || null,
    }),
  });
  await saveAccountPlanDay(tripId, day, plan.version, [
    ...plan.entries.map(accountEntryInput),
    {
      sourceKey: `map:${day}:${point.id}`,
      day,
      variant: "A",
      position:
        Math.max(
          0,
          ...plan.entries.filter((entry) => entry.variant === "A").map((entry) => entry.position),
        ) + 1,
      kind: "place",
      title: point.name,
      timeLabel: "",
      detail: "",
      area: point.folder,
      placeId: point.id,
    },
  ]);

  return "added";
}

export async function saveAccountPlanDay(
  tripId: string,
  day: string,
  version: string,
  entries: readonly Omit<AccountPlanEntry, "id" | "place">[],
): Promise<{ version: string; entries: AccountPlanEntry[] }> {
  const saved = await request<{ version: string; entries: AccountPlanEntry[] }>(
    `/api/trips/${encodeURIComponent(tripId)}/plan?day=${encodeURIComponent(day)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version, entries }),
    },
  );
  refreshCachedAccountPlanDay(tripId, day, saved);

  return saved;
}

type AccountPlace = NonNullable<AccountPlanEntry["place"]>;

function accountPlacePoint(place: AccountPlace): ImportedPoint | null {
  if (place.latitude === null || place.longitude === null) {
    return null;
  }

  return {
    id: place.sourceKey,
    sourceKey: place.sourceKey,
    sourceFile: "account-plan",
    folder: "Imported trip",
    name: place.name,
    description: place.notes ?? "",
    latitude: place.latitude,
    longitude: place.longitude,
    styleRef: "",
    ...(isPlaceCategory(place.category) ? { categoryOverride: place.category } : {}),
    mediaReferences: place.imageUrl ? [place.imageUrl] : [],
  };
}

export function accountPlanPoints(entries: readonly AccountPlanEntry[]): ImportedPoint[] {
  return entries.flatMap(({ place }) => {
    const point = place ? accountPlacePoint(place) : null;

    return point ? [point] : [];
  });
}

export async function saveAccountPlaceCategory(
  tripId: string,
  point: ImportedPoint,
  category: PlaceCategory | null,
): Promise<ImportedPoint> {
  const saved = await request<AccountPlace>(`/api/trips/${encodeURIComponent(tripId)}/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceKey: point.sourceKey,
      name: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
      category,
      imageUrl: point.mediaReferences[0] ?? null,
      notes: point.description || null,
    }),
  });
  const updated = accountPlacePoint(saved);
  if (!updated) {
    throw new Error("The saved place has no coordinates.");
  }

  return updated;
}

export function accountPlanItinerary(
  tripId: string,
  entries: readonly AccountPlanEntry[],
): ItineraryEntry[] {
  return entries.map((entry) => ({
    id: entry.sourceKey,
    tripId,
    day: entry.day,
    variant: entry.variant,
    order: entry.position,
    time: entry.timeLabel,
    title: entry.title,
    detail: entry.detail,
    area: entry.area,
    kind: entry.kind,
    ...(entry.place ? { placeId: entry.place.sourceKey } : {}),
    match: entry.place ? ("matched" as const) : ("unmatched" as const),
  }));
}

export function transitArrivalIds(entries: readonly AccountPlanEntry[]): Set<string> {
  const ordered = [...entries].sort(
    (left, right) => left.variant.localeCompare(right.variant) || left.position - right.position,
  );
  const ids = new Set<string>();
  ordered.forEach((entry, index) => {
    const previous = ordered[index - 1];
    if (
      entry.kind === "transport" &&
      entry.place !== null &&
      previous?.kind === "transport" &&
      previous.variant === entry.variant
    ) {
      ids.add(entry.place.sourceKey);
    }
  });

  return ids;
}

import { loadImportedPlaces, loadImportedVisits } from "../imports/place-library";
import { loadItinerary } from "../imports/itinerary-sheet";
import { buildCreatedPlanRows, startTime } from "../plan/created-plan-rows";
import { createdEditorKey, loadCreatedEditDraft } from "../plan/created-edit-plan-store";
import { visitsSignature } from "../plan/edit-plan-store";
import type { PlannedVisit } from "../plan/plan-store";
import {
  acknowledgeCreatedTripChange,
  loadCreatedTrips,
  pendingCreatedTripChange,
  tripDays,
  type CreatedTrip,
} from "./trip-store";

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

interface LocalDraft {
  day: string;
  variant: string;
  visits: PlannedVisit[];
}

interface DraftAction {
  key: string;
  path: string;
  known: { visits: PlannedVisit[]; revision: string } | null;
  local: LocalDraft | null;
  digest: string;
}

interface AccountCopyMarker {
  entriesDigest: string;
  drafts: Record<string, { digest: string; revision: string }>;
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

function markerKey(ownerId: string, tripId: string): string {
  return `uroute.account-copy.v1.${ownerId}.${tripId}`;
}

export function hasConfirmedAccountCopy(ownerId: string, tripId: string): boolean {
  try {
    return localStorage.getItem(markerKey(ownerId, tripId)) !== null;
  } catch {
    return false;
  }
}

function readMarker(ownerId: string, tripId: string): AccountCopyMarker {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(markerKey(ownerId, tripId)) ?? "null");
    if (typeof value !== "object" || value === null) {
      return { entriesDigest: "", drafts: {} };
    }
    const record = value as Partial<AccountCopyMarker>;
    const drafts: AccountCopyMarker["drafts"] = {};
    if (typeof record.drafts === "object" && record.drafts !== null) {
      for (const [key, item] of Object.entries(record.drafts)) {
        if (
          /^\d{4}-\d{2}-\d{2}:[A-Z]$/.test(key) &&
          typeof item === "object" &&
          item !== null &&
          typeof item.digest === "string" &&
          typeof item.revision === "string" &&
          /^[1-9]\d{0,17}$/.test(item.revision)
        ) {
          drafts[key] = { digest: item.digest, revision: item.revision };
        }
      }
    }

    return {
      entriesDigest: typeof record.entriesDigest === "string" ? record.entriesDigest : "",
      drafts,
    };
  } catch {
    return { entriesDigest: "", drafts: {} };
  }
}

export function accountCopiedDraftProof(
  ownerId: string,
  tripId: string,
  day: string,
  variant: string,
): { digest: string; revision: string } | null {
  return readMarker(ownerId, tripId).drafts[`${day}:${variant}`] ?? null;
}

function writeMarker(ownerId: string, tripId: string, marker: AccountCopyMarker): void {
  try {
    localStorage.setItem(markerKey(ownerId, tripId), JSON.stringify(marker));
  } catch {
    // A missing marker only disables updates; it never permits an overwrite.
  }
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function localSnapshot(
  trip: CreatedTrip,
): Promise<{ entries: AccountEntry[]; drafts: LocalDraft[] }> {
  const [points, itinerary, visits] = await Promise.all([
    loadImportedPlaces(),
    loadItinerary(trip.id),
    loadImportedVisits(),
  ]);
  const result: AccountEntry[] = [];
  const drafts: LocalDraft[] = [];
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
      const savedVisits = rows.map((row) => ({
        placeId: row.id,
        time: startTime(row.time),
        notes: row.detail,
      }));
      const draft = loadCreatedEditDraft(
        createdEditorKey(trip.id, day, variant),
        visitsSignature(savedVisits),
      );
      if (draft) {
        drafts.push({ day, variant, visits: draft.visits });
      }
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

  return { entries: result, drafts };
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

function selectEntry(entry: AccountEntry): AccountEntry {
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

function sameEntries(left: readonly AccountEntry[], right: readonly AccountEntry[]): boolean {
  return JSON.stringify(left.map(selectEntry)) === JSON.stringify(right.map(selectEntry));
}

function entryGroups(entries: readonly AccountEntry[]): Map<string, string> {
  const groups = new Map<string, AccountEntry[]>();
  for (const entry of entries) {
    const key = `${entry.day}:${entry.variant}`;
    groups.set(key, [...(groups.get(key) ?? []), selectEntry(entry)]);
  }

  return new Map(
    [...groups].map(([key, rows]) => [
      key,
      JSON.stringify(
        rows.sort((left, right) =>
          left.position === right.position
            ? left.sourceKey.localeCompare(right.sourceKey)
            : left.position - right.position,
        ),
      ),
    ]),
  );
}

function changedEntryGroups(
  before: readonly AccountEntry[],
  after: readonly AccountEntry[],
): string[] {
  const oldGroups = entryGroups(before);
  const newGroups = entryGroups(after);

  return [...new Set([...oldGroups.keys(), ...newGroups.keys()])].filter(
    (key) => oldGroups.get(key) !== newGroups.get(key),
  );
}

async function getRemoteDraft(
  path: string,
): Promise<{ visits: PlannedVisit[]; revision: string } | null> {
  try {
    return await request<{ visits: PlannedVisit[]; revision: string }>(path);
  } catch (error) {
    if (error instanceof AccountImportError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function importLocalTripToAccount(
  trip: CreatedTrip,
  ownerId: string,
): Promise<{ entries: number; drafts: number }> {
  // Validate the whole local snapshot before creating a server-side trip.
  const pendingToken = pendingCreatedTripChange(trip.id);
  const { entries, drafts } = await localSnapshot(trip);
  const marker = readMarker(ownerId, trip.id);
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
  const remoteDigest = await digest(remote.entries.map(selectEntry));
  if (
    !sameEntries(remote.entries, entries) &&
    (remote.entries.length > 0 || marker.entriesDigest !== "")
  ) {
    if (marker.entriesDigest !== remoteDigest) {
      throw new AccountImportError(
        "This trip already has a different itinerary on your account. Nothing was overwritten.",
        409,
      );
    }
  }
  // Preflight all drafts before changing itinerary rows. CAS still catches races later.
  const actions: DraftAction[] = [];
  for (const draft of drafts) {
    const draftKey = `${draft.day}:${draft.variant}`;
    const path = `/api/trips/${encodeURIComponent(saved.id)}/drafts/${draft.day}/${draft.variant}`;
    const known = await getRemoteDraft(path);
    const localDigest = await digest(draft.visits);
    const previous = marker.drafts[draftKey];
    if (known) {
      const knownDigest = await digest(known.visits);
      if (
        knownDigest !== localDigest &&
        (!previous || previous.digest !== knownDigest || previous.revision !== known.revision)
      ) {
        throw new AccountImportError(
          "A different draft already exists on your account. Nothing was overwritten.",
          409,
        );
      }
    } else if (previous) {
      throw new AccountImportError(
        "A draft was removed from your account. Nothing was overwritten.",
        409,
      );
    }
    actions.push({ key: draftKey, path, known, local: draft, digest: localDigest });
  }
  const localDraftKeys = new Set(drafts.map((draft) => `${draft.day}:${draft.variant}`));
  for (const [draftKey, previous] of Object.entries(marker.drafts)) {
    if (localDraftKeys.has(draftKey)) {
      continue;
    }
    const [day, variant] = draftKey.split(":");
    if (!day || !variant) {
      continue;
    }
    const path = `/api/trips/${encodeURIComponent(saved.id)}/drafts/${day}/${variant}`;
    const known = await getRemoteDraft(path);
    if (
      known &&
      (known.revision !== previous.revision || (await digest(known.visits)) !== previous.digest)
    ) {
      throw new AccountImportError("A draft changed on your account. Nothing was deleted.", 409);
    }
    actions.push({ key: draftKey, path, known, local: null, digest: "" });
  }

  let wroteAccountData = false;
  try {
    let version = remote.version;
    if (!sameEntries(remote.entries, entries)) {
      const updated = await request<{ tripVersion: string }>(
        `/api/trips/${encodeURIComponent(saved.id)}/entries`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version, entries }),
        },
      );
      version = updated.tripVersion;
      wroteAccountData = true;
    }
    marker.entriesDigest = await digest(entries.map(selectEntry));
    writeMarker(ownerId, trip.id, marker);
    for (const action of actions) {
      if (action.local === null) {
        if (action.known) {
          await request(`${action.path}?revision=${encodeURIComponent(action.known.revision)}`, {
            method: "DELETE",
          });
          wroteAccountData = true;
        }
        delete marker.drafts[action.key];
      } else if (action.known && (await digest(action.known.visits)) === action.digest) {
        marker.drafts[action.key] = { digest: action.digest, revision: action.known.revision };
      } else {
        const updated = await request<{ revision: string }>(action.path, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseVersion: version,
            revision: action.known?.revision ?? null,
            visits: action.local.visits,
          }),
        });
        wroteAccountData = true;
        marker.drafts[action.key] = { digest: action.digest, revision: updated.revision };
      }
      writeMarker(ownerId, trip.id, marker);
    }
  } catch (error) {
    if (wroteAccountData) {
      throw new AccountImportError(
        "Some account data was updated before the copy stopped. Your local trip is safe; retry to finish or review the account copy.",
        error instanceof AccountImportError ? error.status : 0,
      );
    }
    throw error;
  }

  acknowledgeCreatedTripChange(trip.id, pendingToken);

  return { entries: entries.length, drafts: drafts.length };
}

export async function syncConfirmedTripEntries(
  tripId: string,
  ownerId: string,
): Promise<{ fromVersion: string; toVersion: string; changedGroups: string[] } | null> {
  if (!hasConfirmedAccountCopy(ownerId, tripId)) {
    return null;
  }
  const trip = loadCreatedTrips().find((candidate) => candidate.id === tripId);
  if (!trip) {
    return null;
  }
  const pendingToken = pendingCreatedTripChange(tripId);
  const { entries } = await localSnapshot(trip);
  const accountTrip = await request<AccountTrip>(`/api/trips/${encodeURIComponent(tripId)}`);
  if (
    accountTrip.startDate !== trip.startDate ||
    accountTrip.endDate !== trip.endDate
  ) {
    // A changed date range affects which days can be saved on the account. A local
    // rename does not, so it must not strand later itinerary and draft edits.
    return null;
  }
  const marker = readMarker(ownerId, tripId);
  const remote = await remoteEntries(tripId);
  const changedGroups = changedEntryGroups(remote.entries, entries);
  if (sameEntries(remote.entries, entries)) {
    marker.entriesDigest = await digest(entries.map(selectEntry));
    writeMarker(ownerId, tripId, marker);
    acknowledgeCreatedTripChange(tripId, pendingToken);

    return { fromVersion: remote.version, toVersion: remote.version, changedGroups: [] };
  }
  if (marker.entriesDigest !== (await digest(remote.entries.map(selectEntry)))) {
    // A different server itinerary must remain untouched until the user reviews it.
    return null;
  }
  const updated = await request<{ tripVersion: string }>(
    `/api/trips/${encodeURIComponent(tripId)}/entries`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: remote.version, entries }),
    },
  );
  marker.entriesDigest = await digest(entries.map(selectEntry));
  writeMarker(ownerId, tripId, marker);
  acknowledgeCreatedTripChange(tripId, pendingToken);

  return { fromVersion: remote.version, toVersion: updated.tripVersion, changedGroups };
}

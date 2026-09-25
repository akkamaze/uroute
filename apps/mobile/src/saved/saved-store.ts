import { useSyncExternalStore } from "react";

import { getAppMode, useAppMode } from "../app-mode";
import { FRIDAY_STOPS } from "../plan/plan-data";

const SAVED_PLACES_KEY = "uroute.mock.saved-place-ids";
const REAL_SAVED_PLACES_KEY = "uroute.real.saved-place-ids.v1";
const DEFAULT_SAVED_IDS = ["kiyomizu", "arabica"];
const SAMPLE_IDS = new Set(FRIDAY_STOPS.map((place) => place.id));

type SavedListener = () => void;

function loadSavedIds(key: string, fallback: readonly string[]): ReadonlySet<string> {
  try {
    const stored = window.localStorage.getItem(key);

    if (stored === null) {
      return new Set(fallback);
    }

    const parsed: unknown = JSON.parse(stored);

    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : new Set(fallback);
  } catch {
    return new Set(fallback);
  }
}

const legacyIds = loadSavedIds(SAVED_PLACES_KEY, DEFAULT_SAVED_IDS);
let snapshots = {
  mock: legacyIds,
  real: loadSavedIds(
    REAL_SAVED_PLACES_KEY,
    [...legacyIds].filter((id) => !SAMPLE_IDS.has(id)),
  ),
};
const listeners = new Set<SavedListener>();

function saveSnapshot(mode: "mock" | "real"): void {
  try {
    window.localStorage.setItem(
      mode === "mock" ? SAVED_PLACES_KEY : REAL_SAVED_PLACES_KEY,
      JSON.stringify([...snapshots[mode]]),
    );
  } catch {
    // The in-memory mock remains usable when session storage is unavailable.
  }
}

function emitChange(mode: "mock" | "real"): void {
  saveSnapshot(mode);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: SavedListener): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function getSnapshot(): typeof snapshots {
  return snapshots;
}

export function useSavedPlaceIds(): ReadonlySet<string> {
  const mode = useAppMode();

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)[mode];
}

export function toggleSavedPlace(placeId: string): void {
  const mode = getAppMode();
  const nextIds = new Set(snapshots[mode]);

  if (nextIds.has(placeId)) {
    nextIds.delete(placeId);
  } else {
    nextIds.add(placeId);
  }

  snapshots = { ...snapshots, [mode]: nextIds };
  emitChange(mode);
}

export function removeSavedPlace(placeId: string): void {
  const mode = getAppMode();
  if (!snapshots[mode].has(placeId)) {
    return;
  }

  const nextIds = new Set(snapshots[mode]);
  nextIds.delete(placeId);
  snapshots = { ...snapshots, [mode]: nextIds };
  emitChange(mode);
}

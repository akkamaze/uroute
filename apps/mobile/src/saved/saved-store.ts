import { useSyncExternalStore } from "react";

const SAVED_PLACES_KEY = "uroute.mock.saved-place-ids";
const DEFAULT_SAVED_IDS = ["kiyomizu", "arabica"];

type SavedListener = () => void;

function loadSavedIds(): ReadonlySet<string> {
  try {
    const stored = window.localStorage.getItem(SAVED_PLACES_KEY);

    if (stored === null) {
      return new Set(DEFAULT_SAVED_IDS);
    }

    const parsed: unknown = JSON.parse(stored);

    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : new Set(DEFAULT_SAVED_IDS);
  } catch {
    return new Set(DEFAULT_SAVED_IDS);
  }
}

let savedIds = loadSavedIds();
const listeners = new Set<SavedListener>();

function saveSnapshot(): void {
  try {
    window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify([...savedIds]));
  } catch {
    // The in-memory mock remains usable when session storage is unavailable.
  }
}

function emitChange(): void {
  saveSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: SavedListener): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
  return savedIds;
}

export function useSavedPlaceIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function toggleSavedPlace(placeId: string): void {
  const nextIds = new Set(savedIds);

  if (nextIds.has(placeId)) {
    nextIds.delete(placeId);
  } else {
    nextIds.add(placeId);
  }

  savedIds = nextIds;
  emitChange();
}

export function removeSavedPlace(placeId: string): void {
  if (!savedIds.has(placeId)) {
    return;
  }

  const nextIds = new Set(savedIds);
  nextIds.delete(placeId);
  savedIds = nextIds;
  emitChange();
}

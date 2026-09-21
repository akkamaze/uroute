import { useSyncExternalStore } from "react";

import { FRIDAY_STOPS } from "./plan-data";

export const KYOTO_DAYS = [12, 13, 14, 15, 16] as const;
export type KyotoDay = (typeof KYOTO_DAYS)[number];
export interface PlannedVisit {
  placeId: string;
  time: string;
  notes: string;
}
interface PlanSnapshot {
  days: Record<KyotoDay, readonly PlannedVisit[]>;
  persistenceFailed: boolean;
}
const STORAGE_KEY = "uroute.mock.kyoto-plan.v1";
const placeIds = new Set(FRIDAY_STOPS.map((place) => place.id));
const listeners = new Set<() => void>();

export function isKyotoDay(value: unknown): value is KyotoDay {
  return typeof value === "number" && KYOTO_DAYS.some((day) => day === value);
}

function defaultDays(): PlanSnapshot["days"] {
  return {
    12: [],
    13: FRIDAY_STOPS.map((place) => ({ placeId: place.id, time: place.time, notes: "" })),
    14: [],
    15: [],
    16: [],
  };
}

function isVisit(value: unknown): value is PlannedVisit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const visit = value as Partial<PlannedVisit>;

  return (
    typeof visit.placeId === "string" &&
    placeIds.has(visit.placeId) &&
    typeof visit.time === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$|^$/.test(visit.time) &&
    typeof visit.notes === "string" &&
    visit.notes.length <= 5_000
  );
}

function loadPlan(): PlanSnapshot {
  const days = defaultDays();
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null || !("days" in stored)) {
      return { days, persistenceFailed: false };
    }
    const storedDays = stored.days;
    if (typeof storedDays !== "object" || storedDays === null) {
      return { days, persistenceFailed: false };
    }
    for (const day of KYOTO_DAYS) {
      const entries: unknown = Reflect.get(storedDays, String(day));
      if (!Array.isArray(entries)) {
        continue;
      }
      const seen = new Set<string>();
      days[day] = entries.filter((entry): entry is PlannedVisit => {
        if (!isVisit(entry) || seen.has(entry.placeId)) {
          return false;
        }
        seen.add(entry.placeId);

        return true;
      });
    }

    return { days, persistenceFailed: false };
  } catch {
    return { days, persistenceFailed: false };
  }
}

let snapshot = loadPlan();

function publish(days: PlanSnapshot["days"]): void {
  let persistenceFailed = false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ days }));
  } catch {
    persistenceFailed = true;
  }
  snapshot = { days, persistenceFailed };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function getKyotoPlan(): PlanSnapshot {
  return snapshot;
}

export function useKyotoPlan(): PlanSnapshot {
  return useSyncExternalStore(subscribe, getKyotoPlan, getKyotoPlan);
}

export function addPlaceToKyotoDay(
  day: number,
  visit: PlannedVisit,
): "added" | "duplicate" | "invalid" {
  if (!isKyotoDay(day) || !isVisit(visit)) {
    return "invalid";
  }
  if (snapshot.days[day].some((entry) => entry.placeId === visit.placeId)) {
    return "duplicate";
  }
  publish({ ...snapshot.days, [day]: [...snapshot.days[day], { ...visit }] });

  return "added";
}

export function reorderKyotoDay(day: KyotoDay, sourceId: string, targetId: string): boolean {
  const visits = snapshot.days[day];
  const sourceIndex = visits.findIndex((visit) => visit.placeId === sourceId);
  const targetIndex = visits.findIndex((visit) => visit.placeId === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return false;
  }
  const next = [...visits];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) {
    return false;
  }
  next.splice(targetIndex, 0, moved);
  publish({ ...snapshot.days, [day]: next });

  return true;
}

export function updateKyotoVisit(day: number, visit: PlannedVisit): boolean {
  if (!isKyotoDay(day) || !isVisit(visit)) {
    return false;
  }
  const visits = snapshot.days[day];
  if (!visits.some((entry) => entry.placeId === visit.placeId)) {
    return false;
  }
  publish({
    ...snapshot.days,
    [day]: visits.map((entry) => (entry.placeId === visit.placeId ? { ...visit } : entry)),
  });

  return true;
}

export interface RemovedVisit {
  day: KyotoDay;
  index: number;
  visit: PlannedVisit;
}

export function removeKyotoVisits(
  day: KyotoDay,
  placeIdsToRemove: readonly string[],
): RemovedVisit[] {
  const visits = snapshot.days[day];
  const requested = new Set(placeIdsToRemove);
  const removed = visits.flatMap((visit, index) =>
    requested.has(visit.placeId) ? [{ day, index, visit: { ...visit } }] : [],
  );
  if (removed.length === 0) {
    return [];
  }
  const removedIds = new Set(removed.map(({ visit }) => visit.placeId));
  publish({ ...snapshot.days, [day]: visits.filter((visit) => !removedIds.has(visit.placeId)) });

  return removed;
}

export function removeKyotoVisit(day: KyotoDay, placeId: string): RemovedVisit | undefined {
  return removeKyotoVisits(day, [placeId])[0];
}

export function restoreKyotoVisits(removedVisits: readonly RemovedVisit[]): number {
  const nextDays = { ...snapshot.days };
  let restoredCount = 0;

  for (const day of KYOTO_DAYS) {
    const candidates = removedVisits
      .filter((removed) => removed.day === day && isVisit(removed.visit))
      .sort((left, right) => left.index - right.index);
    if (candidates.length === 0) {
      continue;
    }
    const next = [...nextDays[day]];
    for (const removed of candidates) {
      if (next.some((visit) => visit.placeId === removed.visit.placeId)) {
        continue;
      }
      next.splice(Math.max(0, Math.min(removed.index, next.length)), 0, { ...removed.visit });
      restoredCount += 1;
    }
    nextDays[day] = next;
  }

  if (restoredCount > 0) {
    publish(nextDays);
  }

  return restoredCount;
}

export function restoreKyotoVisit(removed: RemovedVisit): boolean {
  return restoreKyotoVisits([removed]) === 1;
}

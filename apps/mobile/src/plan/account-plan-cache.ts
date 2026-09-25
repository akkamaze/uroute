import type { AccountPlanEntry, AccountTrip } from "./account-plan";

const CACHE_KEY = "uroute.account-plan-cache.v1";

interface CachedPlanDay {
  version: string;
  entries: AccountPlanEntry[];
}

interface AccountPlanCache {
  userId: string;
  trips: Record<string, AccountTrip>;
  days: Record<string, CachedPlanDay>;
}

let memory: AccountPlanCache | null = null;

function read(userId: string): AccountPlanCache {
  if (memory?.userId === userId) {
    return memory;
  }
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      (stored as AccountPlanCache).userId === userId &&
      typeof (stored as AccountPlanCache).trips === "object" &&
      typeof (stored as AccountPlanCache).days === "object"
    ) {
      memory = stored as AccountPlanCache;

      return memory;
    }
  } catch {
    memory = null;
  }
  memory = { userId, trips: {}, days: {} };

  return memory;
}

function persist(cache: AccountPlanCache): void {
  memory = cache;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    return;
  }
}

export function cachedAccountTrip(userId: string | undefined, tripId: string): AccountTrip | null {
  return userId ? (read(userId).trips[tripId] ?? null) : null;
}

export function cacheAccountTrip(userId: string, trip: AccountTrip): void {
  const cache = read(userId);
  persist({ ...cache, trips: { ...cache.trips, [trip.id]: trip } });
}

export function cachedAccountPlanDay(
  userId: string | undefined,
  tripId: string,
  day: string,
): CachedPlanDay | null {
  return userId ? (read(userId).days[`${tripId}:${day}`] ?? null) : null;
}

export function cacheAccountPlanDay(
  userId: string,
  tripId: string,
  day: string,
  plan: CachedPlanDay,
): void {
  const cache = read(userId);
  persist({
    ...cache,
    days: { ...cache.days, [`${tripId}:${day}`]: { version: plan.version, entries: plan.entries } },
  });
}

export function refreshCachedAccountPlanDay(
  tripId: string,
  day: string,
  plan: CachedPlanDay,
): void {
  if (memory !== null) {
    cacheAccountPlanDay(memory.userId, tripId, day, plan);
  }
}

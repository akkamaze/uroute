import { useAccount } from "@uroute/auth/useAccount";
import { useEffect } from "react";

import { advanceDraftProofsForTrip } from "../plan/created-draft-sync";
import { hasConfirmedAccountCopy, syncConfirmedTripEntries } from "./trip-account-import";
import { CREATED_TRIP_CHANGED, loadCreatedTrips, notifyCreatedTripSynced } from "./trip-store";

export function AccountTripSync(): null {
  const account = useAccount();
  const ownerId = account.user?.id ?? null;

  useEffect(() => {
    if (ownerId !== null) {
      return;
    }
    const retrySession = (): void => account.retry();
    window.addEventListener("online", retrySession);

    return () => window.removeEventListener("online", retrySession);
  }, [account, ownerId]);

  useEffect(() => {
    if (ownerId === null) {
      return;
    }
    let active = true;
    const timers = new Map<string, number>();
    const running = new Map<string, Promise<void>>();
    const schedule = (tripId: string, delay = 800): void => {
      if (!hasConfirmedAccountCopy(ownerId, tripId)) {
        return;
      }
      const previousTimer = timers.get(tripId);
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer);
      }
      timers.set(
        tripId,
        window.setTimeout(() => {
          timers.delete(tripId);
          const previous = running.get(tripId) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(async () => {
              if (active) {
                const result = await syncConfirmedTripEntries(tripId, ownerId);
                if (result && active) {
                  advanceDraftProofsForTrip(
                    ownerId,
                    tripId,
                    result.fromVersion,
                    result.toVersion,
                    result.changedGroups,
                  );
                  notifyCreatedTripSynced(tripId);
                }
              }
            });
          running.set(tripId, next);
          void next.catch(() => {
            // Local changes remain available; online/reopen or a later edit retries.
          });
        }, delay),
      );
    };
    const scan = (): void => loadCreatedTrips().forEach((trip) => schedule(trip.id));
    const changed = (event: Event): void => {
      const tripId = (event as CustomEvent<{ tripId?: unknown }>).detail?.tripId;
      if (typeof tripId === "string") {
        schedule(tripId);
      }
    };
    const storageChanged = (event: StorageEvent): void => {
      if (
        event.key === "uroute.created-trips.v1" ||
        event.key?.startsWith("uroute.created-trip-pending.v1.") ||
        event.key?.startsWith(`uroute.account-copy.v1.${ownerId}.`)
      ) {
        scan();
      }
    };
    window.addEventListener(CREATED_TRIP_CHANGED, changed);
    window.addEventListener("online", scan);
    window.addEventListener("storage", storageChanged);
    scan();

    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(CREATED_TRIP_CHANGED, changed);
      window.removeEventListener("online", scan);
      window.removeEventListener("storage", storageChanged);
    };
  }, [ownerId]);

  return null;
}

import { useAccount } from "@uroute/auth/useAccount";
import { useEffect, useState } from "react";

import { useAppMode } from "../app-mode";
import { loadAccountTrips, type AccountTrip } from "../plan/account-plan";
import { loadCreatedTrips, type CreatedTrip } from "./trip-store";

export function useRealTrips(): { trips: CreatedTrip[]; loading: boolean } {
  const mode = useAppMode();
  const account = useAccount();
  const accountUserId = account.user?.id;
  const [accountTrips, setAccountTrips] = useState<AccountTrip[] | null>(null);

  useEffect(() => {
    if (mode !== "real" || !accountUserId) {
      setAccountTrips([]);

      return;
    }
    let active = true;
    setAccountTrips(null);
    void loadAccountTrips()
      .then((rows) => {
        if (active) {
          setAccountTrips(rows);
        }
      })
      .catch(() => {
        if (active) {
          setAccountTrips([]);
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId, mode]);

  const local = loadCreatedTrips();
  const remote = accountTrips ?? [];

  return {
    trips: [...remote, ...local.filter((trip) => !remote.some((item) => item.id === trip.id))],
    loading:
      account.loading || (mode === "real" && Boolean(accountUserId) && accountTrips === null),
  };
}

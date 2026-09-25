import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import { observeInstallEvents } from "./pwa/install-state";
import { PwaPrompts } from "./pwa/PwaPrompts";
import { router } from "./router";
import { AccountTripSync } from "./trips/AccountTripSync";

export function App(): React.JSX.Element {
  useEffect(observeInstallEvents, []);

  return (
    <>
      <RouterProvider router={router} />
      <AccountTripSync />
      {import.meta.env.PROD ? <PwaPrompts /> : null}
    </>
  );
}

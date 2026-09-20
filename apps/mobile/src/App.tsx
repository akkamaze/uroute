import { RouterProvider } from "@tanstack/react-router";

import { PwaPrompts } from "./pwa/PwaPrompts";
import { router } from "./router";

export function App(): React.JSX.Element {
  return (
    <>
      <RouterProvider router={router} />
      {import.meta.env.PROD ? <PwaPrompts /> : null}
    </>
  );
}

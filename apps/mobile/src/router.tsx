import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { JournalPage, MobileShell, RootRedirect, SavedPage, TripsPage, UserPage } from "./routes";

const rootRoute = createRootRoute({ component: MobileShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RootRedirect,
});

const tripsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trips",
  component: TripsPage,
});

const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/saved",
  component: SavedPage,
});

const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journal",
  component: JournalPage,
});

const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/user",
  component: UserPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  tripsRoute,
  savedRoute,
  journalRoute,
  userRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

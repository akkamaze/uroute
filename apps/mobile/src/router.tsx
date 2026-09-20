import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import { AppRoot, JournalPage, MobileShell, RootRedirect, SavedPage, UserPage } from "./routes";
import { TripsPage } from "./trips/TripsPage";

interface LoginSearch {
  profile?: "open";
}

interface PlaceSearch {
  place?: string;
}

const rootRoute = createRootRoute({ component: AppRoot });

const loadingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/loading",
  component: lazyRouteComponent(() => import("./entry/LoadingPage"), "LoadingPage"),
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  component: lazyRouteComponent(() => import("./entry/WelcomePage"), "WelcomePage"),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    search.profile === "open" ? { profile: "open" } : {},
  component: lazyRouteComponent(() => import("./entry/LoginPage"), "LoginPage"),
});

const mobileShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "mobile-shell",
  component: MobileShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RootRedirect,
});

const tripsRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/trips",
  component: TripsPage,
});

const planRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/plan",
  component: lazyRouteComponent(() => import("./plan/PlanPage"), "PlanPage"),
});

const placesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/places",
  validateSearch: (search: Record<string, unknown>): PlaceSearch =>
    typeof search.place === "string" ? { place: search.place } : {},
  component: lazyRouteComponent(() => import("./places/PlaceDetailsPage"), "PlaceDetailsPage"),
});

const savedRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/saved",
  component: SavedPage,
});

const journalRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/journal",
  component: JournalPage,
});

const userRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/user",
  component: UserPage,
});

const mobileShellTree = mobileShellRoute.addChildren([
  tripsRoute,
  planRoute,
  savedRoute,
  journalRoute,
  userRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loadingRoute,
  welcomeRoute,
  loginRoute,
  placesRoute,
  mobileShellTree,
]);

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  scrollToTopSelectors: [".mobile-shell__main", ".entry-shell"],
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

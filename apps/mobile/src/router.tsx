import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import { AppRoot, MobileShell, RootRedirect } from "./routes";
import { TripsPage } from "./trips/TripsPage";
import { isKyotoDay, type KyotoDay } from "./plan/plan-store";
import { FRIDAY_STOPS } from "./plan/plan-data";

interface LoginSearch {
  profile?: "open";
}

interface PlaceSearch {
  map?: "full";
  search?: "open";
  q?: string;
  day?: KyotoDay;
  add?: "open";
  note?: "open";
  place?: string;
}

interface JournalSearch extends EditorSearch {
  draft?: number;
}

interface EditorSearch {
  editor?: "open";
}

interface ManageDaySearch {
  day?: KyotoDay;
  view?: "versions";
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
  validateSearch: (search: Record<string, unknown>): { packing?: "open"; newTrip?: "open" } =>
    search.packing === "open"
      ? { packing: "open" }
      : search.newTrip === "open"
        ? { newTrip: "open" }
        : {},
  component: TripsPage,
});

const planRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/plan",
  validateSearch: (
    search: Record<string, unknown>,
  ): { day?: KyotoDay; members?: "open"; stop?: string; map?: "full"; stress?: "1200" } => ({
    ...(isKyotoDay(Number(search.day)) ? { day: Number(search.day) as KyotoDay } : {}),
    ...(search.members === "open"
      ? { members: "open" }
      : typeof search.stop === "string" && FRIDAY_STOPS.some((place) => place.id === search.stop)
        ? { stop: search.stop }
        : search.map === "full"
          ? { map: "full" }
          : {}),
    ...(String(search.stress) === "1200" ? { stress: "1200" } : {}),
  }),
  component: lazyRouteComponent(() => import("./plan/PlanPage"), "PlanPage"),
});

const manageDayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plan/manage",
  validateSearch: (search: Record<string, unknown>): ManageDaySearch => ({
    ...(isKyotoDay(Number(search.day)) ? { day: Number(search.day) as KyotoDay } : {}),
    ...(search.view === "versions" ? { view: "versions" } : {}),
  }),
  component: lazyRouteComponent(() => import("./plan/ManageDayPage"), "ManageDayPage"),
});

const bookingsRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/bookings",
  validateSearch: (search: Record<string, unknown>): { members?: "open" } =>
    search.members === "open" ? { members: "open" } : {},
  component: lazyRouteComponent(() => import("./plan/BookingsPage"), "BookingsPage"),
});

const expensesRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/expenses",
  validateSearch: (search: Record<string, unknown>): EditorSearch & { members?: "open" } =>
    search.members === "open"
      ? { members: "open" }
      : search.editor === "open"
        ? { editor: "open" }
        : {},
  component: lazyRouteComponent(() => import("./plan/ExpensesPage"), "ExpensesPage"),
});

const placesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/places",
  validateSearch: (search: Record<string, unknown>): PlaceSearch => ({
    ...(isKyotoDay(Number(search.day)) ? { day: Number(search.day) as KyotoDay } : {}),
    ...(typeof search.place === "string" ? { place: search.place } : {}),
    ...(search.map === "full"
      ? { map: "full" }
      : search.add === "open"
        ? { add: "open" }
        : search.note === "open"
          ? { note: "open" }
          : search.search === "open"
            ? {
                search: "open",
                ...(typeof search.q === "string" && search.q.trim() !== ""
                  ? { q: search.q.trim().slice(0, 120) }
                  : {}),
              }
            : {}),
  }),
  component: lazyRouteComponent(() => import("./places/PlaceDetailsPage"), "PlaceDetailsPage"),
});

const savedRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/saved",
  component: lazyRouteComponent(() => import("./saved/SavedPage"), "SavedPage"),
});

const journalRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/journal",
  validateSearch: (search: Record<string, unknown>): JournalSearch =>
    search.editor === "open"
      ? {
          editor: "open",
          ...(Number.isSafeInteger(Number(search.draft)) && Number(search.draft) > 0
            ? { draft: Number(search.draft) }
            : {}),
        }
      : {},
  component: lazyRouteComponent(() => import("./journal/JournalPage"), "JournalPage"),
});

const userRoute = createRoute({
  getParentRoute: () => mobileShellRoute,
  path: "/user",
  validateSearch: (search: Record<string, unknown>): { install?: "open" } =>
    search.install === "open" ? { install: "open" } : {},
  component: lazyRouteComponent(() => import("./account/AccountPage"), "AccountPage"),
});

const mobileShellTree = mobileShellRoute.addChildren([
  tripsRoute,
  planRoute,
  bookingsRoute,
  expensesRoute,
  savedRoute,
  journalRoute,
  userRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loadingRoute,
  welcomeRoute,
  loginRoute,
  manageDayRoute,
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

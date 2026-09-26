import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { NavigationIcon, type NavigationIconName } from "./icons/NavigationIcon";
import { attachKeyboardViewport } from "./keyboard/keyboard-viewport";
import { useSwipeBack } from "./navigation/use-swipe-back";
import { keepPortrait, preferPortraitOrientation } from "./orientation";

const navigationItems = [
  { icon: "trips", label: "Trips", to: "/trips" },
  { icon: "maps", label: "Maps", to: "/maps" },
  { icon: "saved", label: "Saved", to: "/saved" },
  { icon: "journal", label: "Journal", to: "/journal" },
  { icon: "you", label: "You", to: "/user" },
] as const satisfies readonly {
  icon: NavigationIconName;
  label: string;
  to: string;
}[];

function isNavigationItemActive(to: string, pathname: string): boolean {
  return (
    pathname === to ||
    (to === "/trips" &&
      (["/bookings", "/expenses"].includes(pathname) || pathname.startsWith("/plan")))
  );
}

export function AppRoot(): React.JSX.Element {
  useEffect(attachKeyboardViewport, []);
  useEffect(() => keepPortrait(window), []);
  const { backdropRef, navigationRef } = useSwipeBack();

  return (
    <div className="app-navigation" ref={navigationRef}>
      <div className="app-navigation__surface">
        <Outlet />
      </div>
      <div className="app-navigation__backdrop" ref={backdropRef} />
      <div className="orientation-guard" role="status">
        <strong>Rotate your phone</strong>
        <span>This screen is designed for portrait view.</span>
      </div>
    </div>
  );
}

export function MobileShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const expandedMap = useRouterState({
    select: (state) =>
      state.location.pathname === "/plan" &&
      new URLSearchParams(state.location.searchStr).get("map") === "full",
  });
  useEffect(() => {
    preferPortraitOrientation();
  }, [pathname, expandedMap]);

  const focused = /^\/plan\/trip\/[^/]+(?:\/bookings|\/expenses)?$/.test(pathname);

  return (
    <div className={`mobile-shell${focused ? " mobile-shell--focused" : ""}`}>
      <main className="mobile-shell__main" data-scroll-restoration-id="mobile-main">
        <Outlet />
      </main>

      {focused ? null : (
        <nav
          aria-hidden={expandedMap}
          aria-label="Primary"
          className="bottom-navigation"
          inert={expandedMap}
        >
          {navigationItems.map(({ icon, label, to }) => {
            const active = isNavigationItemActive(to, pathname);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`bottom-navigation__link${active ? " bottom-navigation__link--active" : ""}`}
                key={to}
                to={to}
              >
                <NavigationIcon active={active} name={icon} />

                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function RootRedirect(): React.JSX.Element {
  return <Navigate replace to="/loading" />;
}

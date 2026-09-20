import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { NavigationIcon, type NavigationIconName } from "./icons/NavigationIcon";
import { preferPortraitOrientation } from "./orientation";

const navigationItems = [
  { icon: "trips", label: "Trips", to: "/trips" },
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
    pathname === to || (to === "/trips" && ["/bookings", "/expenses", "/plan"].includes(pathname))
  );
}

export function AppRoot(): React.JSX.Element {
  return <Outlet />;
}

export function MobileShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    preferPortraitOrientation();
  }, [pathname]);

  return (
    <div className="mobile-shell">
      <main className="mobile-shell__main" data-scroll-restoration-id="mobile-main">
        <Outlet />
      </main>

      <nav aria-label="Primary" className="bottom-navigation">
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
    </div>
  );
}

export function RootRedirect(): React.JSX.Element {
  return <Navigate replace to="/loading" />;
}

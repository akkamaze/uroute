import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

import { Brand } from "./brand";
import { NavigationIcon, type NavigationIconName } from "./icons/NavigationIcon";

interface PreviewPageProps {
  description: string;
  title: string;
}

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
  return pathname === to || (to === "/trips" && pathname === "/plan");
}

function PreviewPage({ description, title }: PreviewPageProps): React.JSX.Element {
  return (
    <section className="preview-page">
      <h1>{title}</h1>

      <p>Preview state: {description}</p>
    </section>
  );
}

export function AppRoot(): React.JSX.Element {
  return <Outlet />;
}

export function MobileShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="mobile-shell">
      <main className="mobile-shell__main">
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
  return <Navigate replace to="/trips" />;
}

export function TripsPage(): React.JSX.Element {
  return (
    <section className="preview-page">
      <h1>Trips</h1>

      <p>Preview state: Trips content will appear here.</p>

      <Link className="preview-link" to="/plan">
        Open plan
      </Link>

      <Link className="preview-link preview-link--secondary" to="/loading">
        Preview loading
      </Link>
    </section>
  );
}

export function SavedPage(): React.JSX.Element {
  return <PreviewPage description="Saved content will appear here." title="Saved" />;
}

export function JournalPage(): React.JSX.Element {
  return <PreviewPage description="Journal content will appear here." title="Journal" />;
}

export function UserPage(): React.JSX.Element {
  return (
    <section className="preview-page">
      <Brand />

      <h1>You</h1>

      <p>Preview state: Your profile content will appear here.</p>
    </section>
  );
}

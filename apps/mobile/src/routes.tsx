import { Link, Navigate, Outlet } from "@tanstack/react-router";
import { Bookmark, BriefcaseBusiness, Map, UserRound } from "lucide-react";

import { Brand } from "./brand";

interface PreviewPageProps {
  description: string;
  title: string;
}

const navigationItems = [
  { icon: BriefcaseBusiness, label: "Trips", to: "/trips" },
  { icon: Bookmark, label: "Saved", to: "/saved" },
  { icon: Map, label: "Journal", to: "/journal" },
  { icon: UserRound, label: "You", to: "/user" },
] as const;

function PreviewPage({ description, title }: PreviewPageProps): React.JSX.Element {
  return (
    <section className="preview-page">
      <h1>{title}</h1>

      <p>Preview state: {description}</p>
    </section>
  );
}

export function MobileShell(): React.JSX.Element {
  return (
    <div className="mobile-shell">
      <main className="mobile-shell__main">
        <Outlet />
      </main>

      <nav aria-label="Primary" className="bottom-navigation">
        {navigationItems.map(({ icon: Icon, label, to }) => (
          <Link
            activeProps={{
              "aria-current": "page",
              className: "bottom-navigation__link bottom-navigation__link--active",
            }}
            className="bottom-navigation__link"
            key={to}
            to={to}
          >
            <Icon
              aria-hidden="true"
              className={`bottom-navigation__icon${to === "/trips" ? " bottom-navigation__icon--trips" : ""}`}
              size={24}
              strokeWidth={1.8}
            />

            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function RootRedirect(): React.JSX.Element {
  return <Navigate replace to="/trips" />;
}

export function TripsPage(): React.JSX.Element {
  return <PreviewPage description="Trips content will appear here." title="Trips" />;
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

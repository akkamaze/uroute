import { Link, Navigate, Outlet } from "@tanstack/react-router";

interface PreviewPageProps {
  description: string;
  title: string;
}

const navigationItems = [
  { label: "Trips", to: "/trips" },
  { label: "Saved", to: "/saved" },
  { label: "Journal", to: "/journal" },
  { label: "You", to: "/user" },
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
        {navigationItems.map((item) => (
          <Link
            activeProps={{
              "aria-current": "page",
              className: "bottom-navigation__link bottom-navigation__link--active",
            }}
            className="bottom-navigation__link"
            key={item.to}
            to={item.to}
          >
            {item.label}
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
  return <PreviewPage description="Your profile content will appear here." title="You" />;
}

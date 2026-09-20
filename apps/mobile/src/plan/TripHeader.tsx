import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export type TripSection = "bookings" | "expenses" | "plan";

interface TripHeaderProps {
  active: TripSection;
}

const SECTIONS = [
  { id: "plan", label: "Plan", to: "/plan" },
  { id: "bookings", label: "Bookings", to: "/bookings" },
  { id: "expenses", label: "Expenses", to: "/expenses" },
] as const;

export function TripHeader({ active }: TripHeaderProps): React.JSX.Element {
  return (
    <>
      <header className="plan-header">
        <Link aria-label="Back to trips" className="plan-header__back" to="/trips">
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
        </Link>

        <div className="plan-header__title">
          <h1>Kyoto</h1>
          <p>12–16 Nov 2026</p>
        </div>

        <button aria-label="Trip members" className="plan-header__members" type="button">
          <img alt="" src="/images/members.png" />
        </button>
      </header>

      <nav aria-label="Trip sections" className="trip-sections">
        {SECTIONS.map((section) => {
          const className =
            active === section.id
              ? "trip-sections__link trip-sections__link--active"
              : "trip-sections__link";

          return (
            <Link
              aria-current={active === section.id ? "page" : undefined}
              className={className}
              key={section.id}
              to={section.to}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

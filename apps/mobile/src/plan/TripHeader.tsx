import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import type { CreatedTrip } from "../trips/trip-store";
import "./trip-members.css";

export type TripSection = "bookings" | "expenses" | "plan";

interface TripHeaderProps {
  active: TripSection;
  inactive?: boolean;
  trip?: CreatedTrip | undefined;
  onEditTrip?: (() => void) | undefined;
}

const SECTIONS = [
  { id: "plan", label: "Plan", to: "/plan" },
  { id: "bookings", label: "Bookings", to: "/plan/bookings" },
  { id: "expenses", label: "Expenses", to: "/expenses" },
] as const;

function tripDateLabel(trip: CreatedTrip): string {
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = new Date(`${trip.startDate}T12:00:00Z`);
  const end = new Date(`${trip.endDate}T12:00:00Z`);

  return `${format.format(start)}–${format.format(end)}`;
}

export function TripHeader({
  active,
  inactive = false,
  trip,
  onEditTrip,
}: TripHeaderProps): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const membersOpen = search.members === "open";
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedHereRef = useRef(false);
  const wasOpenRef = useRef(false);
  const to = SECTIONS.find((section) => section.id === active)?.to ?? "/plan";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (membersOpen && !dialog.open) {
      wasOpenRef.current = true;
      dialog.showModal();
    } else if (!membersOpen && wasOpenRef.current) {
      dialog.close();
      buttonRef.current?.focus({ preventScroll: true });
      openedHereRef.current = false;
      wasOpenRef.current = false;
    }
  }, [membersOpen]);

  function openMembers(): void {
    openedHereRef.current = true;
    void navigate({ to, search: { ...search, members: "open" }, resetScroll: false });
  }

  function closeMembers(): void {
    if (openedHereRef.current) {
      window.history.back();
    } else {
      const nextSearch = { ...search };
      delete nextSearch.members;
      void navigate({ to, search: nextSearch, replace: true, resetScroll: false });
    }
  }

  return (
    <>
      <header aria-hidden={inactive} className="plan-header" inert={inactive}>
        <Link aria-label="Back to trips" className="plan-header__back" to="/trips">
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
        </Link>

        <div className="plan-header__title">
          <h1>{trip?.name ?? "Kyoto"}</h1>
          <p>{trip ? tripDateLabel(trip) : "12–16 Nov 2026"}</p>
        </div>

        {trip && onEditTrip ? (
          <button
            aria-label="Edit trip details"
            className="plan-header__members"
            onClick={onEditTrip}
            type="button"
          >
            <Pencil aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        ) : trip ? null : (
          <button
            aria-label="Trip members"
            className="plan-header__members"
            onClick={openMembers}
            ref={buttonRef}
            type="button"
          >
            <img alt="" src="/images/members.png" />
          </button>
        )}
      </header>

      <nav
        aria-hidden={inactive}
        aria-label="Trip sections"
        className="trip-sections"
        inert={inactive}
      >
        {trip ? (
          <>
            <Link
              aria-current={active === "plan" ? "page" : undefined}
              className={
                active === "plan"
                  ? "trip-sections__link trip-sections__link--active"
                  : "trip-sections__link"
              }
              params={{ tripId: trip.id }}
              to="/plan/trip/$tripId"
            >
              Plan
            </Link>
            <Link
              aria-current={active === "bookings" ? "page" : undefined}
              className={
                active === "bookings"
                  ? "trip-sections__link trip-sections__link--active"
                  : "trip-sections__link"
              }
              params={{ tripId: trip.id }}
              to="/plan/trip/$tripId/bookings"
            >
              Bookings
            </Link>
            <Link
              aria-current={active === "expenses" ? "page" : undefined}
              className={
                active === "expenses"
                  ? "trip-sections__link trip-sections__link--active"
                  : "trip-sections__link"
              }
              params={{ tripId: trip.id }}
              to="/plan/trip/$tripId/expenses"
            >
              Expenses
            </Link>
          </>
        ) : (
          SECTIONS.map((section) => {
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
          })
        )}
      </nav>

      {trip ? null : (
        <dialog
          aria-labelledby={titleId}
          className="trip-members"
          onCancel={(event) => {
            event.preventDefault();
            closeMembers();
          }}
          ref={dialogRef}
        >
          <header>
            <div>
              <h2 id={titleId}>Trip members</h2>
              <p>Kyoto · 4 travelers</p>
            </div>
            <button aria-label="Close trip members" onClick={closeMembers} type="button">
              <X aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          </header>
          <ul>
            <li>
              <img alt="" src="/images/avatar.png" />
              <div>
                <strong>Mina</strong>
                <span>You</span>
              </div>
            </li>
            <li>
              <img alt="" className="trip-members__companions" src="/images/members.png" />
              <div>
                <strong>Travel companions</strong>
                <span>3 other travelers</span>
              </div>
            </li>
          </ul>
          <p className="trip-members__dates">12–16 November 2026</p>
        </dialog>
      )}
    </>
  );
}

import { Link } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, Plus, Search, Tickets, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { trips, type TripPeriod, type TripSummary } from "./trips-data";
import "./trips.css";

interface TripCardProps {
  trip: TripSummary;
}

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const day = new Intl.DateTimeFormat("en", { day: "numeric" });
  const month = new Intl.DateTimeFormat("en", { month: "short" });

  if (sameMonth) {
    return `${day.format(start)}–${day.format(end)} ${month.format(end)} ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${day.format(start)} ${month.format(start)}–${day.format(end)} ${month.format(end)} ${end.getFullYear()}`;
  }

  const full = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${full.format(start)}–${full.format(end)}`;
}

function FeaturedTrip({ trip }: TripCardProps): React.JSX.Element {
  return (
    <article className="featured-trip">
      <img alt={trip.imageAlt} className="featured-trip__image" src={trip.imageSrc} />

      <div className="featured-trip__title">
        <h2>{trip.name}</h2>
        <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
      </div>

      <p>
        {trip.dateLabel} · {trip.durationLabel}
      </p>

      <div className="featured-trip__members">
        <div>
          <img alt="Trip members" src="/images/members.png" />
          <span>You + 3</span>
        </div>

        <Link to="/plan">Open plan</Link>
      </div>
    </article>
  );
}

function CompactTrip({ trip }: TripCardProps): React.JSX.Element {
  return (
    <article className="compact-trip">
      <img alt={trip.imageAlt} src={trip.imageSrc} />

      <div>
        <h2>{trip.name}</h2>
        <p>
          {trip.dateLabel} · {trip.durationLabel}
        </p>
      </div>

      <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} />
    </article>
  );
}

function BeforeYouGo(): React.JSX.Element {
  return (
    <section className="before-you-go">
      <h2>Before you go</h2>

      <div className="preparation-row">
        <Tickets aria-hidden="true" className="preparation-row__icon" size={30} strokeWidth={1.7} />
        <div>
          <strong>Bookings</strong>
          <p>Add flights and stay details</p>
        </div>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} />
      </div>

      <div className="preparation-row">
        <ClipboardCheck
          aria-hidden="true"
          className="preparation-row__icon"
          size={30}
          strokeWidth={1.7}
        />
        <div>
          <strong>Packing list</strong>
          <p>Get ready for Kyoto</p>
        </div>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} />
      </div>
    </section>
  );
}

export function TripsPage(): React.JSX.Element {
  const [period, setPeriod] = useState<TripPeriod>("upcoming");
  const [query, setQuery] = useState("");
  const [draftTrips, setDraftTrips] = useState<readonly TripSummary[]>([]);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("2027-01-10");
  const [endDate, setEndDate] = useState("2027-01-14");
  const [formMessage, setFormMessage] = useState("");
  const newTripDialogRef = useRef<HTMLDialogElement>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const allTrips: readonly TripSummary[] = [...draftTrips, ...trips];
  const visibleTrips = allTrips.filter(
    (trip) => trip.period === period && trip.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  useEffect(() => {
    const dialog = newTripDialogRef.current;

    if (dialog === null) {
      return;
    }

    if (newTripOpen && !dialog.open) {
      dialog.showModal();
      destinationRef.current?.focus();
    } else if (!newTripOpen && dialog.open) {
      dialog.close();
    }
  }, [newTripOpen]);

  function selectPeriod(nextPeriod: TripPeriod): void {
    setPeriod(nextPeriod);
  }

  function closeNewTrip(): void {
    setNewTripOpen(false);
    setFormMessage("");
  }

  function createDraftTrip(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = destination.trim();

    if (name.length === 0 || startDate.length === 0 || endDate.length === 0) {
      setFormMessage("Add a destination and travel dates.");

      return;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (duration < 1) {
      setFormMessage("End date must be on or after the start date.");

      return;
    }

    setDraftTrips((current) => [
      {
        dateLabel: formatDateRange(start, end),
        durationLabel: `${duration} ${duration === 1 ? "day" : "days"}`,
        featured: false,
        imageAlt: "A beach destination",
        imageSrc: "/images/danang.png",
        name,
        period: "upcoming",
      },
      ...current,
    ]);
    setDestination("");
    setPeriod("upcoming");
    setQuery("");
    closeNewTrip();
  }

  return (
    <section className="trips-page">
      <div className="trips-page__title">
        <h1>Your trips</h1>
        <button className="trips-page__new" onClick={() => setNewTripOpen(true)} type="button">
          <Plus aria-hidden="true" size={18} strokeWidth={1.8} />
          New
        </button>
      </div>

      <label className="trip-search">
        <Search aria-hidden="true" size={21} strokeWidth={1.8} />
        <input
          aria-label="Search your trips"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your trips"
          type="search"
          value={query}
        />
        {query.length > 0 ? (
          <button aria-label="Clear search" onClick={() => setQuery("")} type="button">
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        ) : null}
      </label>

      <div aria-label="Trip period" className="trip-period" role="tablist">
        {(["upcoming", "past"] as const).map((value) => (
          <button
            aria-selected={period === value}
            className={
              period === value ? "trip-period__tab trip-period__tab--active" : "trip-period__tab"
            }
            key={value}
            onClick={() => selectPeriod(value)}
            role="tab"
            type="button"
          >
            {value === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      <div className="trips-page__scroll">
        <div aria-live="polite" className="trip-results">
          {visibleTrips.length === 0 ? (
            <div className="trip-results__empty">
              <h2>
                {period === "past" && normalizedQuery.length === 0
                  ? "No past trips yet"
                  : "No trips found"}
              </h2>
              <p>
                {period === "past" && normalizedQuery.length === 0
                  ? "Finished trips will appear here."
                  : "Try another city."}
              </p>
            </div>
          ) : (
            visibleTrips.map((trip) =>
              trip.featured ? (
                <FeaturedTrip key={trip.name} trip={trip} />
              ) : (
                <CompactTrip key={trip.name} trip={trip} />
              ),
            )
          )}
        </div>

        {period === "upcoming" && normalizedQuery.length === 0 ? <BeforeYouGo /> : null}
      </div>

      <dialog
        aria-labelledby="new-trip-title"
        className="new-trip-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeNewTrip();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeNewTrip();
          }
        }}
        ref={newTripDialogRef}
      >
        <form className="new-trip-form" onSubmit={createDraftTrip}>
          <header>
            <div>
              <h2 id="new-trip-title">New trip</h2>
              <p>Start with a destination and dates.</p>
            </div>
            <button aria-label="Close new trip" onClick={closeNewTrip} type="button">
              <X aria-hidden="true" size={22} strokeWidth={1.8} />
            </button>
          </header>

          <label>
            Destination
            <input
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Where are you going?"
              ref={destinationRef}
              value={destination}
            />
          </label>

          <div className="new-trip-form__dates">
            <label>
              Start date
              <input
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label>
              End date
              <input
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>

          {formMessage.length > 0 ? (
            <p aria-live="polite" className="new-trip-form__message">
              {formMessage}
            </p>
          ) : null}

          <button className="new-trip-form__save" type="submit">
            Create draft trip
          </button>
        </form>
      </dialog>
    </section>
  );
}

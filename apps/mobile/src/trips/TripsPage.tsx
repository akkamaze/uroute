import { Link } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, Plus, Search, Tickets, X } from "lucide-react";
import { useState } from "react";

import { trips, type TripPeriod, type TripSummary } from "./trips-data";
import "./trips.css";

interface TripCardProps {
  trip: TripSummary;
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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTrips = trips.filter(
    (trip) => trip.period === period && trip.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  function selectPeriod(nextPeriod: TripPeriod): void {
    setPeriod(nextPeriod);
  }

  return (
    <section className="trips-page">
      <div className="trips-page__title">
        <h1>Your trips</h1>
        <span className="trips-page__new">
          <Plus aria-hidden="true" size={18} strokeWidth={1.8} />
          New
        </span>
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
    </section>
  );
}

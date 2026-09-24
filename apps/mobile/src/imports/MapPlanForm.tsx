import { ArrowLeft, ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, type ReactElement } from "react";

import { loadCreatedTrips } from "../trips/trip-store";
import "../places/places.css";
import { availableDestinations, destinationDays, type MapDestination } from "./map-destination";

function tripLabel(id: string, name: string): string {
  if (id === "kyoto") {
    return "Kyoto · 12–16 Nov 2026";
  }
  const trip = loadCreatedTrips().find((item) => item.id === id);
  if (trip === undefined) {
    return name;
  }
  const start = new Date(`${trip.startDate}T12:00:00Z`);
  const end = new Date(`${trip.endDate}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
  const range =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()}–${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`
      : `${start.getUTCDate()} ${month.format(start)}–${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`;

  return `${name} · ${range}`;
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });

  return `${weekday.format(date)}, ${date.getUTCDate()} ${month.format(date)}`;
}

export function MapPlanForm({
  destination,
  onDestination,
  onBack,
  onAdd,
  pending,
}: {
  destination: MapDestination | null;
  onDestination: (destination: MapDestination) => void;
  onBack: () => void;
  onAdd: () => void;
  pending: boolean;
}): ReactElement {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const trips = availableDestinations();
  const selectedTrip = destination?.trip ?? trips[0]?.id ?? "";
  const days = selectedTrip === "" ? [] : destinationDays(selectedTrip);
  const selectedDay = destination?.day ?? days[0]?.day ?? "";

  useLayoutEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <form
      aria-label="Add to plan"
      className="add-place-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd();
      }}
    >
      <div className="add-place-panel__heading">
        <button
          aria-label="Back to place details"
          onClick={onBack}
          ref={backButtonRef}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <div>
          <p>Add to trip</p>
          <h2>Choose a trip and day</h2>
        </div>
      </div>
      <label>
        Trip
        <span className="add-place-panel__select">
          <select
            aria-label="Destination trip"
            enterKeyHint="next"
            onChange={(event) => {
              const trip = event.target.value;
              onDestination({ trip, day: destinationDays(trip)[0]?.day ?? "" });
            }}
            value={selectedTrip}
          >
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {tripLabel(trip.id, trip.name)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
      </label>
      <label>
        Day
        <span className="add-place-panel__select">
          <select
            aria-label="Destination day"
            enterKeyHint="done"
            onChange={(event) => {
              onDestination({ trip: selectedTrip, day: event.target.value });
            }}
            value={selectedDay}
          >
            {days.map((day) => (
              <option key={day.day} value={day.day}>
                {dayLabel(day.day)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
      </label>
      <button
        className="add-place-panel__confirm"
        disabled={pending || selectedDay === ""}
        type="submit"
      >
        {pending ? "Adding…" : "Add to plan"}
      </button>
    </form>
  );
}

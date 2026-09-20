import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";

import {
  createEmptyPlaces,
  createSamplePlaces,
  createStressPlaces,
  type PlaceCollection,
} from "./map-data";
import { TripMap } from "./TripMap";

const TRIP_DAYS = [
  { date: 12, weekday: "Thu" },
  { date: 13, weekday: "Fri" },
  { date: 14, weekday: "Sat" },
  { date: 15, weekday: "Sun" },
  { date: 16, weekday: "Mon" },
] as const;

function isStressFixtureEnabled(): boolean {
  return (
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("stress") === "1200"
  );
}

export function PlanPage(): React.JSX.Element {
  const [selectedDay, setSelectedDay] = useState<number>(13);
  const [selectedId, setSelectedId] = useState<string | null>("kiyomizu");
  const stressFixtureEnabled = isStressFixtureEnabled();
  const places = useMemo<PlaceCollection>(() => {
    if (selectedDay !== 13) {
      return createEmptyPlaces();
    }

    return stressFixtureEnabled ? createStressPlaces() : createSamplePlaces();
  }, [selectedDay, stressFixtureEnabled]);
  const selectedPlace = places.features.find((place) => place.properties.id === selectedId);

  function selectDay(day: number): void {
    setSelectedDay(day);
    setSelectedId(day === 13 && !stressFixtureEnabled ? "kiyomizu" : null);
  }

  return (
    <section className="plan-page">
      <header className="plan-header">
        <Link aria-label="Back to trips" className="plan-header__back" to="/trips">
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
        </Link>

        <div className="plan-header__title">
          <h1>Kyoto</h1>
          <p>12–16 Nov 2026</p>
        </div>

        <span aria-hidden="true" />
      </header>

      <div aria-label="Trip days" className="day-strip" role="group">
        {TRIP_DAYS.map((day) => (
          <button
            aria-pressed={selectedDay === day.date}
            className={
              selectedDay === day.date
                ? "day-strip__day day-strip__day--selected"
                : "day-strip__day"
            }
            key={day.date}
            onClick={() => selectDay(day.date)}
            type="button"
          >
            <span>{day.weekday}</span>
            <strong>{day.date}</strong>
          </button>
        ))}
      </div>

      {stressFixtureEnabled ? (
        <p className="stress-fixture-label">
          Synthetic stress fixture · {places.features.length.toLocaleString()} points
        </p>
      ) : null}

      <TripMap onSelect={setSelectedId} places={places} selectedId={selectedId} />

      <div aria-live="polite" className="selected-place">
        {selectedPlace === undefined ? (
          <span>
            {places.features.length === 0 ? "No places planned for this day." : "Select a map pin."}
          </span>
        ) : (
          <>
            <span>Selected place</span>
            <strong>{selectedPlace.properties.name}</strong>
          </>
        )}
      </div>
    </section>
  );
}

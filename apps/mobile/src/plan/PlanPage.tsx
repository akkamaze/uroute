import { useNavigate } from "@tanstack/react-router";
import { CloudSun, Coffee, Footprints, Landmark, Plus, Utensils } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  createEmptyPlaces,
  createSamplePlaces,
  createStressPlaces,
  type PlaceCollection,
} from "./map-data";
import { TripMap } from "./TripMap";
import { TripHeader } from "./TripHeader";
import { FRIDAY_STOPS, type PlannedStop } from "./plan-data";

const TRIP_DAYS = [
  { date: 12, fullWeekday: "Thursday", weekday: "Thu" },
  { date: 13, fullWeekday: "Friday", weekday: "Fri" },
  { date: 14, fullWeekday: "Saturday", weekday: "Sat" },
  { date: 15, fullWeekday: "Sunday", weekday: "Sun" },
  { date: 16, fullWeekday: "Monday", weekday: "Mon" },
] as const;

function isStressFixtureEnabled(): boolean {
  const fixtureAvailable =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_STRESS_FIXTURE === "true";

  return fixtureAvailable && new URLSearchParams(window.location.search).get("stress") === "1200";
}

export function PlanPage(): React.JSX.Element {
  const navigate = useNavigate();
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const selectedDayLabel = TRIP_DAYS.find((day) => day.date === selectedDay)?.fullWeekday;

  function selectDay(day: number): void {
    setSelectedDay(day);
    setSelectedId(day === 13 && !stressFixtureEnabled ? "kiyomizu" : null);
  }

  function selectFromMap(id: string): void {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      stopRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function renderStopIcon(stop: PlannedStop): React.JSX.Element {
    if (stop.category === "coffee") {
      return <Coffee aria-hidden="true" size={22} strokeWidth={1.8} />;
    }

    if (stop.category === "food") {
      return <Utensils aria-hidden="true" size={22} strokeWidth={1.8} />;
    }

    return <Landmark aria-hidden="true" size={22} strokeWidth={1.8} />;
  }

  return (
    <section className="plan-page">
      <TripHeader active="plan" />

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

      <TripMap onSelect={selectFromMap} places={places} selectedId={selectedId} />

      <section className="day-plan">
        <header className="day-plan__header">
          <h2>
            {selectedDayLabel}, {selectedDay} November
          </h2>

          <span className="day-plan__weather">
            <CloudSun aria-hidden="true" size={22} strokeWidth={1.8} />
            18°
          </span>
        </header>

        {selectedDay === 13 ? (
          <div aria-label="Friday itinerary" className="timeline">
            {FRIDAY_STOPS.map((stop) => (
              <div className="timeline__entry" key={stop.id}>
                <button
                  aria-pressed={selectedId === stop.id}
                  className={
                    selectedId === stop.id
                      ? "timeline__stop timeline__stop--selected"
                      : "timeline__stop"
                  }
                  onClick={() => {
                    setSelectedId(stop.id);
                    void navigate({ search: { place: stop.id }, to: "/places" });
                  }}
                  ref={(element) => {
                    stopRefs.current[stop.id] = element;
                  }}
                  type="button"
                >
                  <span className="timeline__time">{stop.time}</span>
                  <span className={`timeline__icon timeline__icon--${stop.category}`}>
                    {renderStopIcon(stop)}
                  </span>
                  <span className="timeline__info">
                    <strong>{stop.name}</strong>
                    <span>
                      {stop.type} · {stop.duration}
                    </span>
                  </span>
                  <img alt="" className="timeline__photo" src={stop.image} />
                </button>

                {stop.travelAfter === undefined ? null : (
                  <div className="timeline__travel">
                    <span aria-hidden="true" className="timeline__line" />
                    <Footprints aria-hidden="true" size={19} strokeWidth={1.8} />
                    <span>Walk · {stop.travelAfter.detail}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="day-plan__empty">
            <Landmark aria-hidden="true" size={26} strokeWidth={1.7} />
            <h3>A day to make your own</h3>
            <p>Add your first place when you are ready.</p>
          </div>
        )}

        <button aria-label="Add a place" className="day-plan__add" type="button">
          <Plus aria-hidden="true" size={28} strokeWidth={1.9} />
        </button>
      </section>

      <span aria-live="polite" className="sr-only">
        {selectedPlace === undefined
          ? "No place selected"
          : `${selectedPlace.properties.name} selected`}
      </span>
    </section>
  );
}

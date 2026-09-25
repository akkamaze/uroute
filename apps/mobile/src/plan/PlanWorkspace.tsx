import { lazy, Suspense, useRef, useState, type ReactNode } from "react";

import type { CreatedTrip } from "../trips/trip-store";
import type { PlaceCollection } from "./map-data";
import { MapLoading } from "./MapLoading";
import { TripHeader } from "./TripHeader";

const DeferredTripMap = lazy(async () => ({ default: (await import("./TripMap")).TripMap }));

export interface PlanDayTab {
  id: string;
  weekday: string;
  date: number;
  label: string;
  draft?: boolean;
}

interface PlanWorkspaceProps {
  trip?: CreatedTrip | undefined;
  onEditTrip?: (() => void) | undefined;
  className?: string | undefined;
  days: readonly PlanDayTab[];
  selectedDay: string;
  onDayChange: (day: string) => void;
  mapVisible: boolean;
  mapExpanded: boolean;
  onMapExpandedChange: (expanded: boolean) => void;
  onMapSelect: (placeId: string) => void;
  places: PlaceCollection;
  orderPlaces: PlaceCollection;
  selectedPlaceId: string | null;
  stressLabel?: string | undefined;
  children: ReactNode;
  overlay?: ReactNode;
}

export function PlanWorkspace({
  trip,
  onEditTrip,
  className,
  days,
  selectedDay,
  onDayChange,
  mapVisible,
  mapExpanded,
  onMapExpandedChange,
  onMapSelect,
  places,
  orderPlaces,
  selectedPlaceId,
  stressLabel,
  children,
  overlay,
}: PlanWorkspaceProps): React.JSX.Element {
  const [chromeHidden, setChromeHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  function trackPlanScroll(event: React.UIEvent<HTMLElement>): void {
    const top = event.currentTarget.scrollTop;
    const delta = top - lastScrollTopRef.current;
    lastScrollTopRef.current = top;
    if (mapVisible || top < 16) {
      setChromeHidden(false);
    } else if (delta > 6) {
      setChromeHidden(true);
    } else if (delta < -6) {
      setChromeHidden(false);
    }
  }

  return (
    <section
      className={`plan-page${mapVisible ? "" : " plan-page--plan-only"}${chromeHidden && !mapVisible ? " plan-page--chrome-hidden" : ""}${className ? ` ${className}` : ""}`}
    >
      <TripHeader active="plan" inactive={mapExpanded} onEditTrip={onEditTrip} trip={trip} />
      <div
        aria-hidden={mapExpanded}
        aria-label="Trip days"
        className="day-strip"
        inert={mapExpanded}
        role="group"
      >
        {days.map((day) => (
          <button
            aria-label={`${day.label}${day.draft ? ", draft available" : ""}`}
            aria-pressed={selectedDay === day.id}
            className={
              selectedDay === day.id ? "day-strip__day day-strip__day--selected" : "day-strip__day"
            }
            key={day.id}
            onClick={() => onDayChange(day.id)}
            type="button"
          >
            <span>{day.weekday}</span>
            <strong>
              {day.date}
              {day.draft ? (
                <span aria-hidden="true" className="day-strip__draft-indicator" />
              ) : null}
            </strong>
          </button>
        ))}
      </div>
      {stressLabel ? (
        <p aria-hidden={mapExpanded} className="stress-fixture-label">
          {stressLabel}
        </p>
      ) : null}
      {mapExpanded ? <div aria-hidden="true" className="plan-map-placeholder" /> : null}
      {mapVisible ? (
        <Suspense
          fallback={
            <div
              aria-label="Map"
              className={`trip-map trip-map--planner${mapExpanded ? " trip-map--expanded" : ""}`}
              id="plan-map"
              role="region"
            >
              <MapLoading />
            </div>
          }
        >
          <DeferredTripMap
            expanded={mapExpanded}
            {...(trip ? { fallbackViewport: { latitude: 20, longitude: 0, zoom: 2 } } : {})}
            id="plan-map"
            onExpandedChange={onMapExpandedChange}
            onSelect={onMapSelect}
            orderPlaces={orderPlaces}
            places={places}
            {...(trip ? { recenterLabel: "Recenter on day places" } : {})}
            selectedId={selectedPlaceId}
          />
        </Suspense>
      ) : null}
      <section
        aria-hidden={mapExpanded}
        className="day-plan"
        inert={mapExpanded}
        onScroll={trackPlanScroll}
      >
        {children}
      </section>
      {overlay}
    </section>
  );
}

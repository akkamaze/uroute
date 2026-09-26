import { Landmark } from "lucide-react";

import { startTime, type CreatedPlanRow } from "../plan/created-plan-rows";
import { PlanTimelineRow } from "../plan/PlanTimelineRow";
import { travelEstimate } from "../plan/travel-estimate";
import type { CreatedTrip } from "../trips/trip-store";
import { tripDays } from "../trips/trip-store";
import { importedPointAsStop } from "./imported-stop";

interface MapPlanPanelProps {
  trip: CreatedTrip | undefined;
  day: string;
  rows: readonly CreatedPlanRow[];
  visitedKeys: ReadonlySet<string>;
  loading: boolean;
  onDayChange: (day: string) => void;
  onOpenRow: (row: CreatedPlanRow) => void;
}

function dayHeading(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function MapPlanPanel({
  trip,
  day,
  rows,
  visitedKeys,
  loading,
  onDayChange,
  onOpenRow,
}: MapPlanPanelProps): React.JSX.Element {
  const days = trip ? tripDays(trip) : [];

  return (
    <section aria-label="Trip plan" className="map-plan">
      <header className="map-plan__header">
        <h2>{trip?.name ?? "Trip plan"}</h2>
      </header>
      <div aria-label="Trip days" className="day-strip map-plan__days" role="group">
        {days.map((item) => {
          const date = new Date(`${item.day}T12:00:00Z`);

          return (
            <button
              aria-label={dayHeading(item.day)}
              aria-pressed={day === item.day}
              className={
                day === item.day ? "day-strip__day day-strip__day--selected" : "day-strip__day"
              }
              key={item.day}
              onClick={() => onDayChange(item.day)}
              type="button"
            >
              <span>
                {new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(date)}
              </span>
              <strong>{date.getUTCDate()}</strong>
            </button>
          );
        })}
      </div>
      <h3 className="map-plan__day">{day ? dayHeading(day) : ""}</h3>
      {rows.length ? (
        <div aria-label={`${dayHeading(day)} itinerary`} className="timeline map-plan__timeline">
          {rows.map((row, index) => {
            const stop = row.point ? importedPointAsStop(row.point, row.time) : null;

            return (
              <PlanTimelineRow
                category={stop?.category ?? "unknown"}
                id={row.id}
                image={stop?.image}
                key={row.id}
                onOpen={() => onOpenRow(row)}
                subtitle={
                  stop
                    ? `${stop.type} · ${row.area}`
                    : `${row.kind} · ${row.area || "Not linked to a map pin"}`
                }
                time={startTime(row.time) || row.time.slice(0, 8)}
                title={row.title}
                travel={rows[index + 1] ? travelEstimate(row, rows[index + 1]!) : undefined}
                visited={visitedKeys.has(row.id)}
              >
                {row.detail ? <p className="trip-plan__detail">{row.detail}</p> : null}
              </PlanTimelineRow>
            );
          })}
        </div>
      ) : (
        <div className="day-plan__empty" role={loading ? "status" : undefined}>
          <Landmark aria-hidden="true" size={26} strokeWidth={1.7} />
          <h3>{loading ? "Loading plan…" : "No plans for this day"}</h3>
        </div>
      )}
    </section>
  );
}

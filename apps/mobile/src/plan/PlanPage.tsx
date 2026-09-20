import { useNavigate } from "@tanstack/react-router";
import {
  CloudSun,
  Coffee,
  Footprints,
  Landmark,
  Map as MapIcon,
  Plus,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

const TOUCH_REORDER_DELAY_MS = 260;
const TOUCH_SCROLL_THRESHOLD_PX = 8;

interface TouchReorderState {
  active: boolean;
  sourceId: string;
  startY: number;
  targetId: string;
}

interface PointerReorderState {
  active: boolean;
  pointerId: number;
  sourceId: string;
  startX: number;
  startY: number;
  targetId: string;
}

function isStressFixtureEnabled(): boolean {
  const fixtureAvailable =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_STRESS_FIXTURE === "true";

  return fixtureAvailable && new URLSearchParams(window.location.search).get("stress") === "1200";
}

export function PlanPage(): React.JSX.Element {
  const navigate = useNavigate();
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const touchReorderRef = useRef<TouchReorderState | null>(null);
  const pointerReorderRef = useRef<PointerReorderState | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [selectedDay, setSelectedDay] = useState<number>(13);
  const [selectedId, setSelectedId] = useState<string | null>("kiyomizu");
  const [showMap, setShowMap] = useState(false);
  const [stops, setStops] = useState<PlannedStop[]>([...FRIDAY_STOPS]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState("");
  const stressFixtureEnabled = isStressFixtureEnabled();
  const places = useMemo<PlaceCollection>(() => {
    if (selectedDay !== 13) {
      return createEmptyPlaces();
    }

    if (stressFixtureEnabled) {
      return createStressPlaces();
    }

    const order = new Map(stops.map((stop, index) => [stop.id, index + 1]));
    const samples = createSamplePlaces();

    return {
      ...samples,
      features: samples.features.map((place) => ({
        ...place,
        properties: {
          ...place.properties,
          marker: `place-${order.get(place.properties.id) ?? 1}`,
        },
      })),
    };
  }, [selectedDay, stops, stressFixtureEnabled]);
  const selectedPlace = places.features.find((place) => place.properties.id === selectedId);
  const selectedDayLabel = TRIP_DAYS.find((day) => day.date === selectedDay)?.fullWeekday;

  useEffect(
    () => () => {
      if (touchTimerRef.current !== null) {
        window.clearTimeout(touchTimerRef.current);
      }
    },
    [],
  );

  function clearTouchTimer(): void {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }

  function finishReorder(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      return;
    }

    setStops((currentStops) => {
      const sourceIndex = currentStops.findIndex((stop) => stop.id === sourceId);
      const targetIndex = currentStops.findIndex((stop) => stop.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return currentStops;
      }

      const nextStops = [...currentStops];
      const [movedStop] = nextStops.splice(sourceIndex, 1);

      if (movedStop === undefined) {
        return currentStops;
      }

      nextStops.splice(targetIndex, 0, movedStop);
      setReorderNotice(`${movedStop.name} moved to position ${targetIndex + 1}.`);

      return nextStops;
    });
  }

  function resetDragState(): void {
    clearTouchTimer();
    touchReorderRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
  }

  function startPointerReorder(event: React.PointerEvent<HTMLButtonElement>, stopId: string): void {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    pointerReorderRef.current = {
      active: false,
      pointerId: event.pointerId,
      sourceId: stopId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: stopId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointerReorder(event: React.PointerEvent<HTMLButtonElement>): void {
    const reorder = pointerReorderRef.current;

    if (reorder === null || event.pointerId !== reorder.pointerId) {
      return;
    }

    if (!reorder.active) {
      const distance = Math.hypot(event.clientX - reorder.startX, event.clientY - reorder.startY);

      if (distance < TOUCH_SCROLL_THRESHOLD_PX) {
        return;
      }

      reorder.active = true;
      setDraggedId(reorder.sourceId);
      setDropTargetId(reorder.sourceId);
    }

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-stop-id]");
    const targetId = target?.dataset.stopId;

    if (targetId !== undefined) {
      reorder.targetId = targetId;
      setDropTargetId(targetId);
    }
  }

  function endPointerReorder(event: React.PointerEvent<HTMLButtonElement>): void {
    const reorder = pointerReorderRef.current;

    if (reorder === null || event.pointerId !== reorder.pointerId) {
      return;
    }

    if (reorder.active) {
      finishReorder(reorder.sourceId, reorder.targetId);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    pointerReorderRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
  }

  function startTouchReorder(event: React.TouchEvent<HTMLButtonElement>, stopId: string): void {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];

    if (touch === undefined) {
      return;
    }

    clearTouchTimer();
    touchReorderRef.current = {
      active: false,
      sourceId: stopId,
      startY: touch.clientY,
      targetId: stopId,
    };
    touchTimerRef.current = window.setTimeout(() => {
      const reorder = touchReorderRef.current;

      if (reorder === null) {
        return;
      }

      reorder.active = true;
      setDraggedId(reorder.sourceId);
      setDropTargetId(reorder.sourceId);
    }, TOUCH_REORDER_DELAY_MS);
  }

  function moveTouchReorder(event: React.TouchEvent<HTMLButtonElement>): void {
    const reorder = touchReorderRef.current;
    const touch = event.touches[0];

    if (reorder === null || touch === undefined) {
      return;
    }

    if (!reorder.active) {
      if (Math.abs(touch.clientY - reorder.startY) > TOUCH_SCROLL_THRESHOLD_PX) {
        resetDragState();
      }

      return;
    }

    event.preventDefault();
    const target = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest<HTMLElement>("[data-stop-id]");
    const targetId = target?.dataset.stopId;

    if (targetId !== undefined) {
      reorder.targetId = targetId;
      setDropTargetId(targetId);
    }
  }

  function endTouchReorder(): void {
    const reorder = touchReorderRef.current;

    if (reorder?.active) {
      finishReorder(reorder.sourceId, reorder.targetId);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 300);
    }

    resetDragState();
  }

  function moveStopWithKeyboard(stopId: string, direction: -1 | 1): void {
    const sourceIndex = stops.findIndex((stop) => stop.id === stopId);
    const target = stops[sourceIndex + direction];

    if (sourceIndex < 0 || target === undefined) {
      return;
    }

    finishReorder(stopId, target.id);
  }

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
    <section className={showMap ? "plan-page" : "plan-page plan-page--plan-only"}>
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

      <TripMap
        id="plan-map"
        inactive={!showMap}
        onSelect={selectFromMap}
        places={places}
        selectedId={selectedId}
      />

      <section className="day-plan">
        <header className="day-plan__header">
          <span className="day-plan__heading">
            <h2>
              {selectedDayLabel}, {selectedDay} November
            </h2>
            <span className="day-plan__weather">
              <CloudSun aria-hidden="true" size={22} strokeWidth={1.8} />
              18°
            </span>
          </span>
          <button
            aria-controls="plan-map"
            aria-label="Map view"
            aria-pressed={showMap}
            className="day-plan__view-toggle"
            onClick={() => setShowMap((current) => !current)}
            type="button"
          >
            <MapIcon aria-hidden="true" size={18} strokeWidth={1.8} />
            Map
          </button>
        </header>

        {selectedDay === 13 ? (
          <div aria-label="Friday itinerary" className="timeline">
            {stops.map((stop, index) => (
              <div
                className={
                  dropTargetId === stop.id && draggedId !== stop.id
                    ? "timeline__entry timeline__entry--drop-target"
                    : "timeline__entry"
                }
                key={stop.id}
              >
                <button
                  aria-roledescription="sortable stop"
                  aria-pressed={selectedId === stop.id}
                  className={[
                    "timeline__stop",
                    selectedId === stop.id ? "timeline__stop--selected" : "",
                    draggedId === stop.id ? "timeline__stop--dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-stop-id={stop.id}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      return;
                    }

                    setSelectedId(stop.id);
                    void navigate({ search: { place: stop.id }, to: "/places" });
                  }}
                  onKeyDown={(event) => {
                    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                      event.preventDefault();
                      moveStopWithKeyboard(stop.id, event.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                  onPointerCancel={endPointerReorder}
                  onPointerDown={(event) => startPointerReorder(event, stop.id)}
                  onPointerMove={movePointerReorder}
                  onPointerUp={endPointerReorder}
                  onTouchCancel={resetDragState}
                  onTouchEnd={endTouchReorder}
                  onTouchMove={moveTouchReorder}
                  onTouchStart={(event) => startTouchReorder(event, stop.id)}
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

                {FRIDAY_STOPS[index]?.travelAfter === undefined ? null : (
                  <div className="timeline__travel">
                    <span aria-hidden="true" className="timeline__line" />
                    <span aria-hidden="true" className="timeline__travel-marker">
                      <Footprints size={19} strokeWidth={1.8} />
                    </span>
                    <span>Walk · {FRIDAY_STOPS[index].travelAfter.detail}</span>
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
        {reorderNotice.length === 0 ? "" : ` ${reorderNotice}`}
      </span>
    </section>
  );
}

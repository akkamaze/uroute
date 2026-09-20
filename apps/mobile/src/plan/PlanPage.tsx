import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CloudSun,
  Coffee,
  Footprints,
  GripVertical,
  Landmark,
  Map as MapIcon,
  Plus,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createSamplePlaces, createStressPlaces, type PlaceCollection } from "./map-data";
import { captureNavigationSnapshot } from "../navigation/swipe-back";
import { TripMap } from "./TripMap";
import { TripHeader } from "./TripHeader";
import { FRIDAY_STOPS, type PlannedStop } from "./plan-data";
import { reorderKyotoDay, useKyotoPlan, type KyotoDay } from "./plan-store";

const TRIP_DAYS = [
  { date: 12, fullWeekday: "Thursday", weekday: "Thu" },
  { date: 13, fullWeekday: "Friday", weekday: "Fri" },
  { date: 14, fullWeekday: "Saturday", weekday: "Sat" },
  { date: 15, fullWeekday: "Sunday", weekday: "Sun" },
  { date: 16, fullWeekday: "Monday", weekday: "Mon" },
] as const;

const TOUCH_REORDER_DELAY_MS = 260;
const TOUCH_SCROLL_THRESHOLD_PX = 8;

const TRAVEL_BY_PAIR = new Map(
  FRIDAY_STOPS.flatMap((stop, index) => {
    const nextStop = FRIDAY_STOPS[index + 1];

    if (nextStop === undefined || stop.travelAfter === undefined) {
      return [];
    }

    return [[`${stop.id}:${nextStop.id}`, stop.travelAfter] as const];
  }),
);

interface TouchReorderState {
  active: boolean;
  sourceId: string;
  startX: number;
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
  const search = useSearch({ from: "/mobile-shell/plan" });
  const mapExpanded = search.map === "full";
  const mapOpenedHereRef = useRef(false);
  const wasMapExpandedRef = useRef(false);
  const mapViewButtonRef = useRef<HTMLButtonElement>(null);
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const touchReorderRef = useRef<TouchReorderState | null>(null);
  const pointerReorderRef = useRef<PointerReorderState | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const selectedDay = search.day ?? 13;
  const plan = useKyotoPlan();
  const [selectedId, setSelectedId] = useState<string | null>("kiyomizu");
  const [showMap, setShowMap] = useState(false);
  const mapVisible = showMap || mapExpanded;
  const stops = useMemo(
    () =>
      plan.days[selectedDay].flatMap((visit) => {
        const place = FRIDAY_STOPS.find((candidate) => candidate.id === visit.placeId);

        return place === undefined ? [] : [{ ...place, time: visit.time }];
      }),
    [plan.days, selectedDay],
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState("");
  const [reorderHintVisible, setReorderHintVisible] = useState(true);
  const stressFixtureEnabled = isStressFixtureEnabled();
  const places = useMemo<PlaceCollection>(() => {
    if (stressFixtureEnabled && selectedDay === 13) {
      return createStressPlaces();
    }

    const order = new Map(stops.map((stop, index) => [stop.id, index + 1]));
    const samples = createSamplePlaces();

    return {
      ...samples,
      features: samples.features
        .filter((place) => order.has(place.properties.id))
        .sort(
          (left, right) =>
            (order.get(left.properties.id) ?? 0) - (order.get(right.properties.id) ?? 0),
        )
        .map((place) => ({
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
    const movedStop = stops.find((stop) => stop.id === sourceId);
    const targetIndex = stops.findIndex((stop) => stop.id === targetId);
    if (movedStop !== undefined && reorderKyotoDay(selectedDay, sourceId, targetId)) {
      setReorderHintVisible(false);
      setReorderNotice(`${movedStop.name} moved to position ${targetIndex + 1}.`);
    }
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
      startX: touch.clientX,
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
      if (
        Math.hypot(touch.clientX - reorder.startX, touch.clientY - reorder.startY) >
        TOUCH_SCROLL_THRESHOLD_PX
      ) {
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

  function selectDay(day: KyotoDay): void {
    void navigate({ to: "/plan", search: { ...search, day }, replace: true, resetScroll: false });
    setSelectedId(stressFixtureEnabled ? null : (plan.days[day][0]?.placeId ?? null));
  }

  function selectFromMap(id: string): void {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      stopRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  useEffect(() => {
    if (mapExpanded) {
      wasMapExpandedRef.current = true;
    } else if (wasMapExpandedRef.current) {
      mapOpenedHereRef.current = false;
      wasMapExpandedRef.current = false;
      if (!showMap) {
        mapViewButtonRef.current?.focus();
      }
    }
  }, [mapExpanded, showMap]);

  function changeMapExpanded(next: boolean): void {
    if (next) {
      mapOpenedHereRef.current = true;
      void navigate({ to: "/plan", search: { ...search, map: "full" }, resetScroll: false });
    } else if (mapOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/plan",
        search: {
          day: selectedDay,
          ...(search.stress === "1200" ? { stress: "1200" as const } : {}),
        },
        replace: true,
        resetScroll: false,
      });
    }
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
    <section className={mapVisible ? "plan-page" : "plan-page plan-page--plan-only"}>
      <TripHeader active="plan" inactive={mapExpanded} />

      <div
        aria-hidden={mapExpanded}
        aria-label="Trip days"
        className="day-strip"
        inert={mapExpanded}
        role="group"
      >
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
        <p aria-hidden={mapExpanded} className="stress-fixture-label">
          Synthetic stress fixture · {places.features.length.toLocaleString()} points
        </p>
      ) : null}

      {mapExpanded ? <div aria-hidden="true" className="plan-map-placeholder" /> : null}

      <TripMap
        id="plan-map"
        expanded={mapExpanded}
        inactive={!mapVisible}
        onExpandedChange={changeMapExpanded}
        onSelect={selectFromMap}
        places={places}
        selectedId={selectedId}
      />

      <section aria-hidden={mapExpanded} className="day-plan" inert={mapExpanded}>
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
            aria-pressed={mapVisible}
            className="day-plan__view-toggle"
            ref={mapViewButtonRef}
            onClick={() => setShowMap((current) => !current)}
            type="button"
          >
            <MapIcon aria-hidden="true" size={18} strokeWidth={1.8} />
            Map
          </button>
        </header>

        {plan.persistenceFailed ? (
          <p role="status" className="day-plan__storage-notice">
            Changes are kept for this session. Device storage is unavailable.
          </p>
        ) : null}

        {stops.length > 0 ? (
          <div
            aria-describedby="reorder-help"
            aria-label={`${selectedDayLabel} itinerary`}
            className="timeline"
          >
            {reorderHintVisible ? (
              <p className="timeline__reorder-hint">
                <GripVertical aria-hidden="true" size={17} strokeWidth={1.8} />
                Hold and drag a place to reorder
              </p>
            ) : null}
            <span className="sr-only" id="reorder-help">
              Hold and drag a place to reorder. With a keyboard, focus a place and press Alt plus
              Arrow Up or Alt plus Arrow Down.
            </span>
            {stops.map((stop, index) => {
              const nextStop = stops[index + 1];
              const travel =
                nextStop === undefined
                  ? undefined
                  : TRAVEL_BY_PAIR.get(`${stop.id}:${nextStop.id}`);

              return (
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
                      captureNavigationSnapshot("/places");
                      void navigate({
                        search: { place: stop.id, day: selectedDay },
                        to: "/places",
                      });
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
                    <span className="timeline__time">{stop.time || "Anytime"}</span>
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

                  {travel === undefined ? null : (
                    <div className="timeline__travel">
                      <span aria-hidden="true" className="timeline__line" />
                      <span aria-hidden="true" className="timeline__travel-marker">
                        <Footprints size={19} strokeWidth={1.8} />
                      </span>
                      <span>Walk · {travel.detail}</span>
                    </div>
                  )}
                </div>
              );
            })}
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

      <span aria-hidden={mapExpanded} aria-live="polite" className="sr-only">
        {selectedPlace === undefined
          ? "No place selected"
          : `${selectedPlace.properties.name} selected`}
        {reorderNotice.length === 0 ? "" : ` ${reorderNotice}`}
      </span>
    </section>
  );
}

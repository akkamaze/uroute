import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CloudSun,
  Coffee,
  Footprints,
  Landmark,
  ListOrdered,
  Map as MapIcon,
  Plus,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { captureNavigationSnapshot } from "../navigation/swipe-back";
import { createOrderedPlaces, createStressPlaces } from "./map-data";
import { FRIDAY_STOPS, type PlannedStop } from "./plan-data";
import {
  removeKyotoVisits,
  restoreKyotoVisits,
  useKyotoPlan,
  type KyotoDay,
  type RemovedVisit,
} from "./plan-store";
import { TripHeader } from "./TripHeader";
import "./stop-actions.css";

const TRIP_DAYS = [
  { date: 12, fullWeekday: "Thursday", weekday: "Thu" },
  { date: 13, fullWeekday: "Friday", weekday: "Fri" },
  { date: 14, fullWeekday: "Saturday", weekday: "Sat" },
  { date: 15, fullWeekday: "Sunday", weekday: "Sun" },
  { date: 16, fullWeekday: "Monday", weekday: "Mon" },
] as const;

const REVEAL_PX = 64;
const REVEAL_THRESHOLD_PX = 32;
const DeferredTripMap = lazy(async () => ({ default: (await import("./TripMap")).TripMap }));
const TRAVEL_BY_PAIR = new Map(
  FRIDAY_STOPS.flatMap((stop, index) => {
    const next = FRIDAY_STOPS[index + 1];

    return next === undefined || stop.travelAfter === undefined
      ? []
      : [[`${stop.id}:${next.id}`, stop.travelAfter] as const];
  }),
);

interface StopGesture {
  direction: "pending" | "swipe" | "vertical";
  id: string;
  initialOffset: number;
  pointerId: number;
  startX: number;
  startY: number;
}

interface RemovalOperation {
  dayLabel: string;
  removed: RemovedVisit[];
}

function mergeRemovedVisits(
  previous: readonly RemovedVisit[],
  latest: readonly RemovedVisit[],
): RemovedVisit[] {
  const adjustedLatest = latest.map((removed) => {
    let originalIndex = removed.index;
    const priorForDay = previous
      .filter((prior) => prior.day === removed.day)
      .sort((left, right) => left.index - right.index);

    for (const prior of priorForDay) {
      if (prior.index <= originalIndex) {
        originalIndex += 1;
      }
    }

    return { ...removed, index: originalIndex };
  });

  return [...previous, ...adjustedLatest];
}

function isStressFixtureEnabled(stress: "1200" | undefined): boolean {
  return (
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_STRESS_FIXTURE === "true") &&
    stress === "1200"
  );
}

export function PlanPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/plan" });
  const selectedDay = search.day ?? 13;
  const plan = useKyotoPlan();
  const mapExpanded = search.map === "full";
  const [showMap, setShowMap] = useState(false);
  const mapVisible = showMap || mapExpanded;
  const [selectedId, setSelectedId] = useState<string | null>("kiyomizu");
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [removal, setRemoval] = useState<RemovalOperation | null>(null);
  const [liveNotice, setLiveNotice] = useState("");
  const gestureRef = useRef<StopGesture | null>(null);
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mapViewButtonRef = useRef<HTMLButtonElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const suppressClickRef = useRef(false);
  const mapOpenedHereRef = useRef(false);
  const wasMapExpandedRef = useRef(false);
  const stressEnabled = isStressFixtureEnabled(search.stress);
  const stops = useMemo(
    () =>
      plan.days[selectedDay].flatMap((visit) => {
        const place = FRIDAY_STOPS.find((candidate) => candidate.id === visit.placeId);

        return place === undefined ? [] : [{ ...place, time: visit.time }];
      }),
    [plan.days, selectedDay],
  );
  const orderPlaces = useMemo(() => createOrderedPlaces(stops.map(({ id }) => id)), [stops]);
  const places = useMemo(
    () => (stressEnabled && selectedDay === 13 ? createStressPlaces() : orderPlaces),
    [orderPlaces, selectedDay, stressEnabled],
  );
  const weekday = TRIP_DAYS.find(({ date }) => date === selectedDay)?.fullWeekday ?? "Selected day";
  const dayLabel = `${weekday}, ${selectedDay} November`;

  function clearGesture(): void {
    gestureRef.current = null;
  }

  function suppressClick(): void {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 300);
  }

  function closeSwipe(): void {
    clearGesture();
    setOpenSwipeId(null);
    setSwipeOffset(0);
  }

  useEffect(() => {
    closeSwipe();
    setSelectedId(stressEnabled ? null : (plan.days[selectedDay][0]?.placeId ?? null));
    // Reset only when the active day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  useEffect(() => {
    if (mapExpanded) {
      closeSwipe();
    }
    // Reset only when the full-screen map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapExpanded]);

  useEffect(() => () => clearGesture(), []);

  function startStopGesture(event: React.PointerEvent<HTMLDivElement>, id: string): void {
    if (event.button !== 0) {
      return;
    }
    if (gestureRef.current !== null && gestureRef.current.pointerId !== event.pointerId) {
      closeSwipe();

      return;
    }
    gestureRef.current = {
      direction: "pending",
      id,
      initialOffset: openSwipeId === id ? -REVEAL_PX : 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function moveStopGesture(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.direction === "pending") {
      if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        gesture.direction = "swipe";
        event.currentTarget.setPointerCapture(event.pointerId);
        setOpenSwipeId(gesture.id);
      } else if (Math.abs(dy) >= 10 && Math.abs(dy) >= Math.abs(dx) / 1.25) {
        gesture.direction = "vertical";
      }
    }
    if (gesture.direction === "swipe") {
      setSwipeOffset(Math.max(-REVEAL_PX, Math.min(0, gesture.initialOffset + dx)));
    }
  }

  function endStopGesture(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const wasSwipe = gesture.direction === "swipe";
    const finalOffset = Math.max(
      -REVEAL_PX,
      Math.min(0, gesture.initialOffset + event.clientX - gesture.startX),
    );
    clearGesture();
    if (!wasSwipe) {
      return;
    }
    suppressClick();
    if (finalOffset <= -REVEAL_THRESHOLD_PX) {
      setOpenSwipeId(gesture.id);
      setSwipeOffset(-REVEAL_PX);
    } else {
      closeSwipe();
    }
  }

  function focusAfterRemoval(removedIds: ReadonlySet<string>): void {
    const index = stops.findIndex(({ id }) => removedIds.has(id));
    const remaining = stops.filter(({ id }) => !removedIds.has(id));
    const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
    window.requestAnimationFrame(() => {
      if (next !== undefined) {
        stopRefs.current[next.id]?.focus({ preventScroll: true });
      } else {
        emptyHeadingRef.current?.focus({ preventScroll: true });
      }
    });
  }

  function removeStop(id: string): void {
    const removed = removeKyotoVisits(selectedDay, [id]);
    if (removed.length === 0) {
      return;
    }
    const removedIds = new Set(removed.map(({ visit }) => visit.placeId));
    setRemoval((current) => ({
      dayLabel: current === null || current.dayLabel === dayLabel ? dayLabel : "Trip plan",
      removed: current === null ? removed : mergeRemovedVisits(current.removed, removed),
    }));
    setLiveNotice("1 place removed.");
    if (selectedId !== null && removedIds.has(selectedId)) {
      setSelectedId(null);
    }
    closeSwipe();
    focusAfterRemoval(removedIds);
  }

  function undoRemoval(): void {
    if (removal === null) {
      return;
    }
    const operation = removal;
    const count = restoreKyotoVisits(operation.removed);
    setRemoval(null);
    setLiveNotice(`${count} ${count === 1 ? "place" : "places"} restored.`);
    const first = operation.removed[0];
    if (count > 0 && first?.day === selectedDay) {
      setSelectedId(first.visit.placeId);
      window.requestAnimationFrame(() =>
        stopRefs.current[first.visit.placeId]?.focus({ preventScroll: true }),
      );
    }
  }

  function selectDay(day: KyotoDay): void {
    closeSwipe();
    void navigate({ to: "/plan", search: { ...search, day }, replace: true, resetScroll: false });
  }

  function addPlace(): void {
    captureNavigationSnapshot("/places");
    void navigate({
      to: "/places",
      search: { day: selectedDay, search: "open" },
      state: (current) => ({ ...current, placeSelectionEntry: true }),
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
    closeSwipe();
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
      {stressEnabled ? (
        <p aria-hidden={mapExpanded} className="stress-fixture-label">
          Synthetic stress fixture · {places.features.length.toLocaleString()} points
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
              <p className="trip-map__status">Loading map…</p>
            </div>
          }
        >
          <DeferredTripMap
            id="plan-map"
            expanded={mapExpanded}
            onExpandedChange={changeMapExpanded}
            onSelect={(id) => {
              setSelectedId(id);
              window.requestAnimationFrame(() =>
                stopRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
              );
            }}
            places={places}
            orderPlaces={orderPlaces}
            selectedId={selectedId}
          />
        </Suspense>
      ) : null}

      <section aria-hidden={mapExpanded} className="day-plan" inert={mapExpanded}>
        <header className="day-plan__header">
          <span className="day-plan__heading">
            <h2>{dayLabel}</h2>
            <span className="day-plan__weather">
              <CloudSun aria-hidden="true" size={22} strokeWidth={1.8} />
              18°
            </span>
          </span>
          <span className="day-plan__header-actions">
            <button
              aria-controls="plan-map"
              aria-label="Map view"
              aria-pressed={mapVisible}
              className="day-plan__view-toggle"
              ref={mapViewButtonRef}
              onClick={() => setShowMap((current) => !current)}
              type="button"
            >
              <MapIcon aria-hidden="true" size={22} strokeWidth={1.8} />
            </button>
            <span className="day-plan__select-wrap">
              <button
                aria-label={`Edit plan for ${dayLabel}`}
                className="day-plan__select-toggle"
                onClick={() => void navigate({ to: "/plan/manage", search: { day: selectedDay } })}
                type="button"
              >
                <ListOrdered aria-hidden="true" size={22} strokeWidth={1.8} />
              </button>
            </span>
          </span>
        </header>
        {plan.persistenceFailed ? (
          <p role="status" className="day-plan__storage-notice">
            Changes are kept for this session. Device storage is unavailable.
          </p>
        ) : null}

        {stops.length > 0 ? (
          <div aria-label={`${weekday} itinerary`} className="timeline">
            {stops.map((stop, index) => {
              const next = stops[index + 1];
              const travel =
                next === undefined ? undefined : TRAVEL_BY_PAIR.get(`${stop.id}:${next.id}`);
              const swipeOpen = openSwipeId === stop.id;

              return (
                <div className="timeline__entry" data-plan-stop-id={stop.id} key={stop.id}>
                  <div className="timeline__swipe-shell" data-swipe-back-ignore="true">
                    <button
                      aria-hidden={!swipeOpen}
                      aria-label={`Remove ${stop.name} from ${dayLabel}`}
                      className="timeline__remove"
                      onClick={() => removeStop(stop.id)}
                      tabIndex={swipeOpen ? 0 : -1}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={18} strokeWidth={1.8} />
                      <span>Remove</span>
                    </button>
                    <div
                      className={`timeline__surface timeline__surface--plan${swipeOpen ? " timeline__surface--swipe-open" : ""}`}
                      onLostPointerCapture={clearGesture}
                      onPointerCancel={clearGesture}
                      onPointerDown={(event) => startStopGesture(event, stop.id)}
                      onPointerMove={moveStopGesture}
                      onPointerUp={endStopGesture}
                      style={
                        {
                          "--swipe-offset": `${swipeOpen ? swipeOffset : 0}px`,
                        } as React.CSSProperties
                      }
                    >
                      <button
                        aria-pressed={selectedId === stop.id}
                        className="timeline__stop"
                        data-stop-id={stop.id}
                        onClick={() => {
                          if (suppressClickRef.current) {
                            return;
                          }
                          if (swipeOpen) {
                            closeSwipe();

                            return;
                          }
                          setSelectedId(stop.id);
                          captureNavigationSnapshot("/places");
                          void navigate({
                            search: { place: stop.id, day: selectedDay },
                            to: "/places",
                          });
                        }}
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
                    </div>
                  </div>
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
            <h3 ref={emptyHeadingRef} tabIndex={-1}>
              A day to make your own
            </h3>
            <p>Add your first place when you are ready.</p>
          </div>
        )}
        {removal === null && openSwipeId === null ? (
          <button
            aria-label={`Add a place to ${dayLabel}`}
            className="day-plan__add"
            onClick={addPlace}
            type="button"
          >
            <Plus aria-hidden="true" size={28} strokeWidth={1.9} />
          </button>
        ) : null}
      </section>

      {removal === null ? null : (
        <div
          aria-hidden={mapExpanded}
          className="plan-undo"
          data-swipe-back-ignore="true"
          inert={mapExpanded}
        >
          <span>
            <strong>
              {removal.removed.length} {removal.removed.length === 1 ? "place" : "places"} removed
            </strong>
            {removal.dayLabel === "Trip plan"
              ? "From your trip plan"
              : `From ${removal.dayLabel.replace(/^\w+, /, "")}`}
          </span>
          <button onClick={undoRemoval} type="button">
            Undo
          </button>
          <button
            aria-label="Dismiss removal message"
            onClick={() => setRemoval(null)}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        </div>
      )}
      <span aria-hidden={mapExpanded} aria-live="polite" className="sr-only">
        {liveNotice}
      </span>
    </section>
  );
}

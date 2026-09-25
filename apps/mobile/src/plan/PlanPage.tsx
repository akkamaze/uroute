import { useNavigate, useSearch } from "@tanstack/react-router";
import { CloudSun, Landmark, Map as MapIcon, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { captureNavigationSnapshot } from "../navigation/swipe-back";
import { loadImportedPlaces } from "../imports/place-library";
import { importedPointAsStop } from "../imports/imported-stop";
import type { ImportedPoint } from "../imports/parse-place-file";
import { loadEditPlanDraft, visitsSignature } from "./edit-plan-store";
import { createOrderedPlaces, createStressPlaces } from "./map-data";
import { FRIDAY_STOPS } from "./plan-data";
import {
  removeKyotoVisits,
  restoreKyotoVisits,
  useKyotoPlan,
  type KyotoDay,
  type RemovedVisit,
} from "./plan-store";
import { PlanWorkspace } from "./PlanWorkspace";
import { PlanTimelineRow } from "./PlanTimelineRow";
import { usePlanStopSwipe } from "./usePlanStopSwipe";
import "./stop-actions.css";

const TRIP_DAYS = [
  { date: 12, fullWeekday: "Thursday", weekday: "Thu" },
  { date: 13, fullWeekday: "Friday", weekday: "Fri" },
  { date: 14, fullWeekday: "Saturday", weekday: "Sat" },
  { date: 15, fullWeekday: "Sunday", weekday: "Sun" },
  { date: 16, fullWeekday: "Monday", weekday: "Mon" },
] as const;

const TRAVEL_BY_PAIR = new Map(
  FRIDAY_STOPS.flatMap((stop, index) => {
    const next = FRIDAY_STOPS[index + 1];

    return next === undefined || stop.travelAfter === undefined
      ? []
      : [[`${stop.id}:${next.id}`, stop.travelAfter] as const];
  }),
);

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
  const [importedPoints, setImportedPoints] = useState<ImportedPoint[]>([]);
  useEffect(() => {
    let active = true;
    void loadImportedPlaces()
      .then((points) => {
        if (active) {
          setImportedPoints(points);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);
  const draftDays = new Set<KyotoDay>(
    TRIP_DAYS.flatMap(({ date }) =>
      loadEditPlanDraft(date, visitsSignature(plan.days[date])) === null ? [] : [date],
    ),
  );
  const hasDraft = draftDays.has(selectedDay);
  const mapExpanded = search.map === "full";
  const [showMap, setShowMap] = useState(false);
  const mapVisible = showMap || mapExpanded;
  const [selectedId, setSelectedId] = useState<string | null>("kiyomizu");
  const stopSwipe = usePlanStopSwipe();
  const [removal, setRemoval] = useState<RemovalOperation | null>(null);
  const [liveNotice, setLiveNotice] = useState("");
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mapViewButtonRef = useRef<HTMLButtonElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const mapOpenedHereRef = useRef(false);
  const wasMapExpandedRef = useRef(false);
  const stressEnabled = isStressFixtureEnabled(search.stress);
  const stops = useMemo(
    () =>
      plan.days[selectedDay].flatMap((visit) => {
        const place =
          FRIDAY_STOPS.find((candidate) => candidate.id === visit.placeId) ??
          importedPoints.find((candidate) => candidate.id === visit.placeId);

        return place === undefined
          ? []
          : [
              {
                ...("latitude" in place ? importedPointAsStop(place, visit.time) : place),
                time: visit.time,
              },
            ];
      }),
    [importedPoints, plan.days, selectedDay],
  );
  const orderPlaces = useMemo(() => {
    const staticPlaces = createOrderedPlaces(stops.map(({ id }) => id));

    return {
      ...staticPlaces,
      features: stops.flatMap((stop, index) => {
        const known = staticPlaces.features.find((feature) => feature.properties.id === stop.id);
        if (known !== undefined) {
          return [known];
        }
        const point = importedPoints.find((item) => item.id === stop.id);

        return point === undefined
          ? []
          : [
              {
                type: "Feature" as const,
                id: point.id,
                geometry: {
                  type: "Point" as const,
                  coordinates: [point.longitude, point.latitude],
                },
                properties: {
                  id: point.id,
                  name: point.name,
                  category: "Imported place",
                  marker: `place-${index + 1}`,
                  synthetic: false,
                },
              },
            ];
      }),
    };
  }, [importedPoints, stops]);
  const places = useMemo(
    () => (stressEnabled && selectedDay === 13 ? createStressPlaces() : orderPlaces),
    [orderPlaces, selectedDay, stressEnabled],
  );
  const weekday = TRIP_DAYS.find(({ date }) => date === selectedDay)?.fullWeekday ?? "Selected day";
  const dayLabel = `${weekday}, ${selectedDay} November`;

  useEffect(() => {
    stopSwipe.close();
    setSelectedId(stressEnabled ? null : (plan.days[selectedDay][0]?.placeId ?? null));
    // Reset only when the active day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  useEffect(() => {
    if (mapExpanded) {
      stopSwipe.close();
    }
    // Reset only when the full-screen map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapExpanded]);

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
    stopSwipe.close();
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
    stopSwipe.close();
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
    stopSwipe.close();
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

  return (
    <PlanWorkspace
      days={TRIP_DAYS.map((day) => ({
        id: String(day.date),
        weekday: day.weekday,
        date: day.date,
        label: `${day.fullWeekday} ${day.date}`,
        draft: draftDays.has(day.date),
      }))}
      selectedDay={String(selectedDay)}
      onDayChange={(day) => selectDay(Number(day) as KyotoDay)}
      mapVisible={mapVisible}
      mapExpanded={mapExpanded}
      onMapExpandedChange={changeMapExpanded}
      onMapSelect={(id) => {
        setSelectedId(id);
        window.requestAnimationFrame(() =>
          stopRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        );
      }}
      places={places}
      orderPlaces={orderPlaces}
      selectedPlaceId={selectedId}
      stressLabel={
        stressEnabled
          ? `Synthetic stress fixture · ${places.features.length.toLocaleString()} points`
          : undefined
      }
      overlay={
        <>
          {removal === null ? null : (
            <div
              aria-hidden={mapExpanded}
              className="plan-undo"
              data-swipe-back-ignore="true"
              inert={mapExpanded}
            >
              <span>
                <strong>
                  {removal.removed.length} {removal.removed.length === 1 ? "place" : "places"}{" "}
                  removed
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
        </>
      }
    >
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
              onClick={() => {
                captureNavigationSnapshot("/plan/edit");
                void navigate({
                  to: "/plan/edit",
                  search: { day: selectedDay },
                  state: (current) => ({ ...current, editPlanEntry: true }),
                });
              }}
              type="button"
            >
              <span className="day-plan__edit-icon">
                <Pencil aria-hidden="true" size={21} strokeWidth={1.8} />
                {hasDraft ? (
                  <span aria-hidden="true" className="day-plan__draft-indicator" />
                ) : null}
              </span>
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
            const swipeOpen = stopSwipe.openId === stop.id;

            return (
              <PlanTimelineRow
                buttonRef={(element) => {
                  stopRefs.current[stop.id] = element;
                }}
                category={stop.category}
                id={stop.id}
                image={stop.image}
                key={stop.id}
                onOpen={() => {
                  if (stopSwipe.clickSuppressed()) {
                    return;
                  }
                  if (swipeOpen) {
                    stopSwipe.close();

                    return;
                  }
                  setSelectedId(stop.id);
                  if (stop.id.startsWith("import-")) {
                    void navigate({
                      to: "/maps",
                      search: { trip: "kyoto", day: `2026-11-${selectedDay}`, place: stop.id },
                    });
                  } else {
                    captureNavigationSnapshot("/places");
                    void navigate({ search: { place: stop.id, day: selectedDay }, to: "/places" });
                  }
                }}
                onRemove={() => removeStop(stop.id)}
                removeLabel={`Remove ${stop.name} from ${dayLabel}`}
                selected={selectedId === stop.id}
                subtitle={`${stop.type} · ${stop.duration}`}
                swipe={{
                  open: swipeOpen,
                  offset: stopSwipe.offset,
                  onStart: (event) => stopSwipe.start(event, stop.id),
                  onMove: stopSwipe.move,
                  onEnd: stopSwipe.end,
                  onCancel: stopSwipe.clear,
                }}
                time={stop.time}
                title={stop.name}
                travel={travel === undefined ? undefined : `Walk · ${travel.detail}`}
              />
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
      <button
        className="day-plan__browse-maps"
        onClick={() =>
          void navigate({ to: "/maps", search: { trip: "kyoto", day: `2026-11-${selectedDay}` } })
        }
        type="button"
      >
        Browse imported maps
      </button>
      {removal === null && stopSwipe.openId === null ? (
        <button
          aria-label={`Add a place to ${dayLabel}`}
          className="floating-add-button"
          onClick={addPlace}
          type="button"
        >
          <Plus aria-hidden="true" size={28} strokeWidth={1.9} />
        </button>
      ) : null}
    </PlanWorkspace>
  );
}

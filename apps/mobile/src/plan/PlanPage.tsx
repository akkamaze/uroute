import { useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Check,
  CloudSun,
  Coffee,
  Footprints,
  GripVertical,
  Landmark,
  ListChecks,
  Map as MapIcon,
  Plus,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { captureNavigationSnapshot } from "../navigation/swipe-back";
import { createOrderedPlaces, createStressPlaces } from "./map-data";
import { FRIDAY_STOPS, type PlannedStop } from "./plan-data";
import {
  removeKyotoVisits,
  reorderKyotoDay,
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

const LONG_PRESS_MS = 450;
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
  timer: number | null;
}

interface ReorderGesture {
  active: boolean;
  cancelActive: boolean;
  cancelBounds: { bottom: number; left: number; right: number; top: number } | null;
  frame: number | null;
  layoutOffsetY: number;
  latestClientX: number;
  latestClientY: number;
  layout: { centerY: number; id: string }[];
  onPointerEnd: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  pointerId: number;
  scrollBounds: { bottom: number; top: number } | null;
  scrollContainer: HTMLElement | null;
  sourceId: string;
  startScrollTop: number;
  targetId: string;
  surface: HTMLElement | null;
  startX: number;
  startY: number;
}

interface ReorderAnimation {
  before: Map<string, DOMRect>;
}

interface ReorderPreviewAnimation extends ReorderAnimation {
  draggedTop: number | null;
  sourceId: string;
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

function getPlanDay(search: unknown): KyotoDay {
  if (typeof search !== "object" || search === null || !("day" in search)) {
    return 13;
  }
  const day = search.day;

  return TRIP_DAYS.some((candidate) => candidate.date === day) ? (day as KyotoDay) : 13;
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStopIds, setSelectedStopIds] = useState<Set<string>>(() => new Set());
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [removal, setRemoval] = useState<RemovalOperation | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"after" | "before" | null>(null);
  const [previewStopIds, setPreviewStopIds] = useState<string[] | null>(null);
  const [cancelDropActive, setCancelDropActive] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");
  const gestureRef = useRef<StopGesture | null>(null);
  const reorderRef = useRef<ReorderGesture | null>(null);
  const reorderAnimationRef = useRef<ReorderAnimation | null>(null);
  const reorderPreviewAnimationRef = useRef<ReorderPreviewAnimation | null>(null);
  const stopRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mapViewButtonRef = useRef<HTMLButtonElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const bulkButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const leaveSelectionDialogRef = useRef<HTMLDialogElement>(null);
  const keepSelectingRef = useRef<HTMLButtonElement>(null);
  const cancelDropRef = useRef<HTMLDivElement>(null);
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
  const displayedStops = useMemo(() => {
    if (previewStopIds === null) {
      return stops;
    }
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const preview = previewStopIds.flatMap((id) => {
      const stop = byId.get(id);

      return stop === undefined ? [] : [stop];
    });

    return preview.length === stops.length ? preview : stops;
  }, [previewStopIds, stops]);
  const orderPlaces = useMemo(() => createOrderedPlaces(stops.map(({ id }) => id)), [stops]);
  const places = useMemo(
    () => (stressEnabled && selectedDay === 13 ? createStressPlaces() : orderPlaces),
    [orderPlaces, selectedDay, stressEnabled],
  );
  const weekday = TRIP_DAYS.find(({ date }) => date === selectedDay)?.fullWeekday ?? "Selected day";
  const dayLabel = `${weekday}, ${selectedDay} November`;
  const selectedCount = selectedStopIds.size;
  const navigationBlocker = useBlocker({
    enableBeforeUnload: selectionMode && selectedCount > 0,
    shouldBlockFn: ({ current, next }) => {
      if (!selectionMode || selectedCount === 0 || current.pathname !== "/plan") {
        return false;
      }

      return next.pathname !== "/plan" || getPlanDay(next.search) !== selectedDay;
    },
    withResolver: true,
  });
  const changingDay =
    navigationBlocker.status === "blocked" &&
    navigationBlocker.current.pathname === "/plan" &&
    navigationBlocker.next.pathname === "/plan";

  function clearGesture(): void {
    if (gestureRef.current?.timer !== null && gestureRef.current?.timer !== undefined) {
      window.clearTimeout(gestureRef.current.timer);
    }
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

  function exitSelection(): void {
    setSelectionMode(false);
    setSelectedStopIds(new Set());
    setConfirming(false);
  }

  function enterSelection(firstId?: string): void {
    closeSwipe();
    setSelectionMode(true);
    setSelectedStopIds(firstId === undefined ? new Set() : new Set([firstId]));
    setLiveNotice(
      firstId === undefined ? "Selection mode. No places selected." : "1 place selected.",
    );
  }

  useEffect(() => {
    closeSwipe();
    exitSelection();
    setSelectedId(stressEnabled ? null : (plan.days[selectedDay][0]?.placeId ?? null));
    // State reset is intentionally keyed only to the active day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  useEffect(() => {
    if (mapExpanded) {
      closeSwipe();
      exitSelection();
    }
    // This reset is only required when the full-screen map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapExpanded]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (confirming && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => cancelRef.current?.focus());
    } else if (!confirming && dialog.open) {
      dialog.close();
    }
  }, [confirming]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || confirming) {
        return;
      }
      if (leaveSelectionDialogRef.current?.open) {
        return;
      }
      if (selectionMode) {
        exitSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirming, selectionMode]);

  useEffect(() => {
    const dialog = leaveSelectionDialogRef.current;
    if (dialog === null) {
      return;
    }
    if (navigationBlocker.status === "blocked" && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => keepSelectingRef.current?.focus());
    } else if (navigationBlocker.status === "idle" && dialog.open) {
      dialog.close();
    }
  }, [navigationBlocker.status]);

  useEffect(
    () => () => {
      clearGesture();
      const drag = reorderRef.current;
      if (drag?.frame !== null && drag?.frame !== undefined) {
        window.cancelAnimationFrame(drag.frame);
      }
      if (drag !== null) {
        window.removeEventListener("pointermove", drag.onPointerMove);
        window.removeEventListener("pointerup", drag.onPointerEnd);
        window.removeEventListener("pointercancel", drag.onPointerEnd);
      }
      drag?.surface?.style.removeProperty("--reorder-offset-y");
      reorderRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const pending = reorderPreviewAnimationRef.current;
    if (pending === null) {
      return;
    }
    reorderPreviewAnimationRef.current = null;
    const drag = reorderRef.current;
    if (drag !== null && drag.sourceId === pending.sourceId && pending.draggedTop !== null) {
      const currentTop = drag.surface?.getBoundingClientRect().top;
      if (currentTop !== undefined) {
        drag.layoutOffsetY += pending.draggedTop - currentTop;
        const scrollDelta = (drag.scrollContainer?.scrollTop ?? 0) - drag.startScrollTop;
        const offsetY = drag.latestClientY - drag.startY + scrollDelta + drag.layoutOffsetY;
        drag.surface?.style.setProperty("--reorder-offset-y", `${offsetY}px`);
      }
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    for (const [id, before] of pending.before) {
      if (id === pending.sourceId) {
        continue;
      }
      const surface = stopRefs.current[id]?.closest<HTMLElement>(".timeline__surface");
      if (surface === null || surface === undefined) {
        continue;
      }
      const after = surface.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 0.5) {
        continue;
      }
      surface.animate(
        [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
  }, [previewStopIds]);

  useLayoutEffect(() => {
    const pending = reorderAnimationRef.current;
    if (pending === null) {
      return;
    }
    reorderAnimationRef.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    for (const [id, before] of pending.before) {
      const surface = stopRefs.current[id]?.closest<HTMLElement>(".timeline__surface");
      if (surface === null || surface === undefined) {
        continue;
      }
      const after = surface.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 0.5) {
        continue;
      }
      surface.animate(
        [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
  }, [stops]);

  function toggleSelection(id: string): void {
    setSelectedStopIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setLiveNotice(`${next.size} ${next.size === 1 ? "place" : "places"} selected.`);

      return next;
    });
  }

  function startStopGesture(event: React.PointerEvent<HTMLDivElement>, id: string): void {
    if (selectionMode || draggedId !== null || event.button !== 0) {
      return;
    }
    if (gestureRef.current !== null && gestureRef.current.pointerId !== event.pointerId) {
      closeSwipe();

      return;
    }
    const gesture: StopGesture = {
      direction: "pending",
      id,
      initialOffset: openSwipeId === id ? -REVEAL_PX : 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
    };
    gesture.timer = window.setTimeout(() => {
      if (gestureRef.current === gesture && gesture.direction === "pending") {
        suppressClick();
        clearGesture();
        enterSelection(id);
      }
    }, LONG_PRESS_MS);
    gestureRef.current = gesture;
  }

  function moveStopGesture(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) > 8 && gesture.timer !== null) {
      window.clearTimeout(gesture.timer);
      gesture.timer = null;
    }
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

  function removeStops(ids: readonly string[]): void {
    const removed = removeKyotoVisits(
      selectedDay,
      ids.filter((id) => stops.some((stop) => stop.id === id)),
    );
    if (removed.length === 0) {
      return;
    }
    const removedIds = new Set(removed.map(({ visit }) => visit.placeId));
    setRemoval((current) => ({
      dayLabel: current === null || current.dayLabel === dayLabel ? dayLabel : "Trip plan",
      removed: current === null ? removed : mergeRemovedVisits(current.removed, removed),
    }));
    setLiveNotice(`${removed.length} ${removed.length === 1 ? "place" : "places"} removed.`);
    if (selectedId !== null && removedIds.has(selectedId)) {
      setSelectedId(null);
    }
    closeSwipe();
    exitSelection();
    focusAfterRemoval(removedIds);
  }

  function requestSelectedRemoval(): void {
    const ids = [...selectedStopIds].filter((id) => stops.some((stop) => stop.id === id));
    if (ids.length === 1) {
      removeStops(ids);
    } else if (ids.length > 1) {
      setConfirming(true);
    }
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

  function finishReorder(sourceId: string, targetId: string): boolean {
    const stop = stops.find(({ id }) => id === sourceId);
    const targetIndex = stops.findIndex(({ id }) => id === targetId);
    if (stop !== undefined && reorderKyotoDay(selectedDay, sourceId, targetId)) {
      setLiveNotice(`${stop.name} moved to position ${targetIndex + 1}.`);

      return true;
    }

    return false;
  }

  function captureReorderRects(): Map<string, DOMRect> {
    const before = new Map<string, DOMRect>();
    for (const stop of stops) {
      const surface = stopRefs.current[stop.id]?.closest<HTMLElement>(".timeline__surface");
      if (surface !== null && surface !== undefined) {
        before.set(stop.id, surface.getBoundingClientRect());
      }
    }

    return before;
  }

  function previewReorder(drag: ReorderGesture, targetId: string): void {
    const ids = stops.map(({ id }) => id);
    const sourceIndex = ids.indexOf(drag.sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const before = captureReorderRects();
    const draggedTop = drag.surface?.getBoundingClientRect().top ?? null;
    for (const id of ids) {
      if (id !== drag.sourceId) {
        stopRefs.current[id]
          ?.closest<HTMLElement>(".timeline__surface")
          ?.getAnimations()
          .forEach((animation) => animation.cancel());
      }
    }
    const [source] = ids.splice(sourceIndex, 1);
    if (source === undefined) {
      return;
    }
    ids.splice(targetIndex, 0, source);
    reorderPreviewAnimationRef.current = { before, draggedTop, sourceId: drag.sourceId };
    setPreviewStopIds(targetId === drag.sourceId ? null : ids);
  }

  function queueReorderFrame(drag: ReorderGesture): void {
    if (drag.frame !== null) {
      return;
    }
    drag.frame = window.requestAnimationFrame(() => {
      drag.frame = null;
      if (reorderRef.current !== drag || !drag.active || drag.surface === null) {
        return;
      }

      if (updateReorderPosition(drag, true)) {
        queueReorderFrame(drag);
      }
    });
  }

  function updateReorderPosition(drag: ReorderGesture, allowAutoScroll: boolean): boolean {
    const container = drag.scrollContainer;
    const bounds = drag.scrollBounds;
    if (drag.cancelBounds === null) {
      const cancelBounds = cancelDropRef.current?.getBoundingClientRect();
      drag.cancelBounds =
        cancelBounds === undefined
          ? null
          : {
              bottom: cancelBounds.bottom,
              left: cancelBounds.left,
              right: cancelBounds.right,
              top: cancelBounds.top,
            };
    }
    const overCancel =
      drag.cancelBounds !== null &&
      drag.latestClientX >= drag.cancelBounds.left &&
      drag.latestClientX <= drag.cancelBounds.right &&
      drag.latestClientY >= drag.cancelBounds.top &&
      drag.latestClientY <= drag.cancelBounds.bottom;
    if (overCancel !== drag.cancelActive) {
      drag.cancelActive = overCancel;
      setCancelDropActive(overCancel);
    }
    let didAutoScroll = false;
    if (!overCancel && allowAutoScroll && container !== null && bounds !== null) {
      const edge = 56;
      let scrollBy = 0;
      if (drag.latestClientY < bounds.top + edge) {
        scrollBy = -12 * (1 - Math.max(0, drag.latestClientY - bounds.top) / edge);
      } else if (drag.latestClientY > bounds.bottom - edge) {
        scrollBy = 12 * (1 - Math.max(0, bounds.bottom - drag.latestClientY) / edge);
      }
      if (Math.abs(scrollBy) > 0.5) {
        const previousScrollTop = container.scrollTop;
        container.scrollTop += scrollBy;
        didAutoScroll = container.scrollTop !== previousScrollTop;
      }
    }

    const scrollDelta = (container?.scrollTop ?? 0) - drag.startScrollTop;
    const offsetY = drag.latestClientY - drag.startY + scrollDelta + drag.layoutOffsetY;
    drag.surface?.style.setProperty("--reorder-offset-y", `${offsetY}px`);

    if (overCancel) {
      if (drag.targetId !== drag.sourceId) {
        drag.targetId = drag.sourceId;
        previewReorder(drag, drag.sourceId);
      }
      setDropTargetId(null);
      setDropPosition(null);

      return false;
    }

    const pointerContentY = drag.latestClientY + scrollDelta;
    const nearest = drag.layout.reduce<{ centerY: number; id: string } | null>(
      (closest, candidate) =>
        closest === null ||
        Math.abs(candidate.centerY - pointerContentY) < Math.abs(closest.centerY - pointerContentY)
          ? candidate
          : closest,
      null,
    );
    if (nearest !== null && nearest.id !== drag.targetId) {
      drag.targetId = nearest.id;
      previewReorder(drag, nearest.id);
      setDropTargetId(nearest.id);
      const sourceIndex = stops.findIndex(({ id }) => id === drag.sourceId);
      const targetIndex = stops.findIndex(({ id }) => id === nearest.id);
      setDropPosition(sourceIndex < targetIndex ? "after" : "before");
    }

    return didAutoScroll;
  }

  function startReorder(event: React.PointerEvent<HTMLButtonElement>, id: string): void {
    if (selectionMode || event.button !== 0) {
      return;
    }
    closeSwipe();
    const drag: ReorderGesture = {
      active: false,
      cancelActive: false,
      cancelBounds: null,
      frame: null,
      layoutOffsetY: 0,
      latestClientX: event.clientX,
      latestClientY: event.clientY,
      layout: [],
      onPointerEnd: () => undefined,
      onPointerMove: () => undefined,
      pointerId: event.pointerId,
      scrollBounds: null,
      scrollContainer: event.currentTarget.closest<HTMLElement>(".day-plan"),
      sourceId: id,
      startScrollTop: 0,
      targetId: id,
      surface: event.currentTarget.closest<HTMLElement>(".timeline__surface"),
      startX: event.clientX,
      startY: event.clientY,
    };
    drag.onPointerMove = (pointerEvent) => moveReorder(pointerEvent);
    drag.onPointerEnd = (pointerEvent) => endReorder(pointerEvent);
    reorderRef.current = drag;
    drag.startScrollTop = drag.scrollContainer?.scrollTop ?? 0;
    window.addEventListener("pointermove", drag.onPointerMove, { passive: false });
    window.addEventListener("pointerup", drag.onPointerEnd);
    window.addEventListener("pointercancel", drag.onPointerEnd);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveReorder(event: PointerEvent): void {
    const drag = reorderRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) {
        return;
      }
      drag.active = true;
      drag.layout = Array.from(
        document.querySelectorAll<HTMLElement>("[data-drop-stop-id]"),
      ).flatMap((entry) => {
        const surface = entry.querySelector<HTMLElement>(".timeline__surface");
        const id = entry.dataset.dropStopId;
        if (surface === null || id === undefined) {
          return [];
        }
        const bounds = surface.getBoundingClientRect();

        return [{ centerY: bounds.top + bounds.height / 2, id }];
      });
      const scrollBounds = drag.scrollContainer?.getBoundingClientRect();
      drag.scrollBounds =
        scrollBounds === undefined ? null : { bottom: scrollBounds.bottom, top: scrollBounds.top };
      drag.surface?.getAnimations().forEach((animation) => animation.cancel());
      setDraggedId(drag.sourceId);
      setDropTargetId(drag.sourceId);
      setDropPosition(null);
    }
    event.preventDefault();
    drag.latestClientX = event.clientX;
    drag.latestClientY = event.clientY;
    queueReorderFrame(drag);
  }

  function endReorder(event: PointerEvent): void {
    const drag = reorderRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.frame !== null) {
      window.cancelAnimationFrame(drag.frame);
      drag.frame = null;
    }
    window.removeEventListener("pointermove", drag.onPointerMove);
    window.removeEventListener("pointerup", drag.onPointerEnd);
    window.removeEventListener("pointercancel", drag.onPointerEnd);
    if (drag.active) {
      drag.latestClientX = event.clientX;
      drag.latestClientY = event.clientY;
      updateReorderPosition(drag, false);
    }
    const cancelled = event.type === "pointercancel" || drag.cancelActive;
    let moved = false;
    if (drag.active && !cancelled && drag.sourceId !== drag.targetId) {
      const before = captureReorderRects();
      reorderAnimationRef.current = { before };
      drag.surface?.style.removeProperty("--reorder-offset-y");
      moved = finishReorder(drag.sourceId, drag.targetId);
      if (!moved) {
        reorderAnimationRef.current = null;
      }
    }
    if (drag.active) {
      suppressClick();
    }
    if (drag.cancelActive) {
      setLiveNotice("Move cancelled.");
    }
    reorderRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
    setPreviewStopIds(null);
    setCancelDropActive(false);
    if (!moved) {
      window.requestAnimationFrame(() => drag.surface?.style.removeProperty("--reorder-offset-y"));
    }
  }

  function moveStopWithKeyboard(id: string, direction: -1 | 1): void {
    const index = stops.findIndex((stop) => stop.id === id);
    const target = stops[index + direction];
    if (index >= 0 && target !== undefined) {
      finishReorder(id, target.id);
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
        <header
          className={
            selectionMode ? "day-plan__header day-plan__header--selection" : "day-plan__header"
          }
        >
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
                aria-label={selectionMode ? "Exit selection mode" : "Select places"}
                aria-pressed={selectionMode}
                className="day-plan__select-toggle"
                onClick={() => (selectionMode ? exitSelection() : enterSelection())}
                type="button"
              >
                <ListChecks aria-hidden="true" size={22} strokeWidth={1.8} />
              </button>
            </span>
          </span>
          {selectionMode ? (
            <div className="timeline__toolbar">
              <button onClick={exitSelection} type="button">
                Cancel
              </button>
              <button
                onClick={() => {
                  const allSelected = selectedCount === stops.length;
                  setSelectedStopIds(allSelected ? new Set() : new Set(stops.map(({ id }) => id)));
                  setLiveNotice(
                    allSelected ? "No places selected." : `${stops.length} places selected.`,
                  );
                }}
                type="button"
              >
                {selectedCount === stops.length ? "Deselect all" : "Select all"}
              </button>
            </div>
          ) : null}
        </header>
        {plan.persistenceFailed ? (
          <p role="status" className="day-plan__storage-notice">
            Changes are kept for this session. Device storage is unavailable.
          </p>
        ) : null}

        {stops.length > 0 ? (
          <div aria-label={`${weekday} itinerary`} className="timeline">
            <span className="sr-only" id="reorder-help">
              Drag this handle to reorder. With a keyboard, press Alt plus Arrow Up or Alt plus
              Arrow Down.
            </span>
            {displayedStops.map((stop, index) => {
              const next = displayedStops[index + 1];
              const travel =
                next === undefined ? undefined : TRAVEL_BY_PAIR.get(`${stop.id}:${next.id}`);
              const checked = selectedStopIds.has(stop.id);
              const swipeOpen = openSwipeId === stop.id;

              return (
                <div
                  className={`timeline__entry${draggedId === stop.id ? " timeline__entry--dragging" : ""}${dropTargetId === stop.id && draggedId !== stop.id ? ` timeline__entry--drop-target${dropPosition === "after" ? " timeline__entry--drop-after" : ""}` : ""}`}
                  data-drop-stop-id={stop.id}
                  key={stop.id}
                >
                  <div className="timeline__swipe-shell" data-swipe-back-ignore="true">
                    <button
                      aria-hidden={!swipeOpen}
                      aria-label={`Remove ${stop.name} from ${dayLabel}`}
                      className="timeline__remove"
                      onClick={() => removeStops([stop.id])}
                      tabIndex={swipeOpen ? 0 : -1}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={18} strokeWidth={1.8} />
                      <span>Remove</span>
                    </button>
                    <div
                      className={`timeline__surface${selectionMode ? " timeline__surface--selection-mode" : ""}${swipeOpen ? " timeline__surface--swipe-open" : ""}${checked ? " timeline__surface--selected" : ""}${draggedId === stop.id ? " timeline__surface--dragging" : ""}`}
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
                      {!selectionMode ? (
                        <button
                          aria-describedby="reorder-help"
                          aria-label={`Reorder ${stop.name}`}
                          className="timeline__grip"
                          data-swipe-back-ignore="true"
                          onKeyDown={(event) => {
                            if (
                              event.altKey &&
                              (event.key === "ArrowUp" || event.key === "ArrowDown")
                            ) {
                              event.preventDefault();
                              moveStopWithKeyboard(stop.id, event.key === "ArrowUp" ? -1 : 1);
                            }
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            startReorder(event, stop.id);
                          }}
                          type="button"
                        >
                          <GripVertical aria-hidden="true" size={18} strokeWidth={1.8} />
                        </button>
                      ) : null}
                      <button
                        aria-checked={selectionMode ? checked : undefined}
                        aria-label={selectionMode ? `Select ${stop.name}` : undefined}
                        aria-pressed={!selectionMode ? selectedId === stop.id : undefined}
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
                          if (selectionMode) {
                            toggleSelection(stop.id);

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
                        role={selectionMode ? "checkbox" : undefined}
                        type="button"
                      >
                        {selectionMode ? (
                          <span
                            aria-hidden="true"
                            className={`timeline__selection-checkbox${checked ? " timeline__selection-checkbox--checked" : ""}`}
                          >
                            {checked ? <Check size={15} strokeWidth={2.4} /> : null}
                          </span>
                        ) : (
                          <span className="timeline__time">{stop.time || "Anytime"}</span>
                        )}
                        {selectionMode ? (
                          <span className="timeline__time">{stop.time || "Anytime"}</span>
                        ) : (
                          <span className={`timeline__icon timeline__icon--${stop.category}`}>
                            {renderStopIcon(stop)}
                          </span>
                        )}
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
        {!selectionMode && removal === null && openSwipeId === null && draggedId === null ? (
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

      {draggedId === null ? null : (
        <div
          aria-hidden="true"
          className={`plan-reorder-cancel${cancelDropActive ? " plan-reorder-cancel--active" : ""}`}
          data-swipe-back-ignore="true"
          ref={cancelDropRef}
        >
          <X size={18} strokeWidth={2} />
          <span>Cancel move</span>
        </div>
      )}

      {selectionMode && selectedCount > 0 ? (
        <div
          aria-hidden={mapExpanded}
          className="plan-bulk-remove"
          data-swipe-back-ignore="true"
          inert={mapExpanded}
        >
          <button
            aria-label={`Remove ${selectedCount} ${selectedCount === 1 ? "place" : "places"}`}
            onClick={requestSelectedRemoval}
            ref={bulkButtonRef}
            type="button"
          >
            <Trash2 aria-hidden="true" size={20} strokeWidth={1.9} />
            <span aria-hidden="true">{selectedCount}</span>
          </button>
        </div>
      ) : null}
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
      <dialog
        aria-labelledby="remove-places-title"
        className="remove-stops-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setConfirming(false);
          window.requestAnimationFrame(() => bulkButtonRef.current?.focus());
        }}
        ref={dialogRef}
      >
        <h2 id="remove-places-title">Remove {selectedCount} places?</h2>
        <p>These places will be removed from {dayLabel}. You can undo this.</p>
        <div>
          <button
            onClick={() => {
              setConfirming(false);
              window.requestAnimationFrame(() => bulkButtonRef.current?.focus());
            }}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <button
            className="remove-stops-dialog__confirm"
            onClick={() => removeStops([...selectedStopIds])}
            type="button"
          >
            Remove {selectedCount} places
          </button>
        </div>
      </dialog>
      <dialog
        aria-labelledby="leave-selection-title"
        className="remove-stops-dialog selection-leave-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (navigationBlocker.status === "blocked") {
            navigationBlocker.reset();
          }
        }}
        ref={leaveSelectionDialogRef}
      >
        <h2 id="leave-selection-title">{changingDay ? "Change day?" : "Leave selection mode?"}</h2>
        <p>
          Your {selectedCount} selected {selectedCount === 1 ? "place" : "places"} will be cleared.
        </p>
        <div>
          <button
            onClick={() => {
              if (navigationBlocker.status === "blocked") {
                navigationBlocker.reset();
              }
            }}
            ref={keepSelectingRef}
            type="button"
          >
            Keep selecting
          </button>
          <button
            className="selection-leave-dialog__confirm"
            onClick={() => {
              if (navigationBlocker.status === "blocked") {
                exitSelection();
                navigationBlocker.proceed();
              }
            }}
            type="button"
          >
            {changingDay ? "Change day" : "Leave page"}
          </button>
        </div>
      </dialog>
      <span aria-hidden={mapExpanded} aria-live="polite" className="sr-only">
        {liveNotice}
      </span>
    </section>
  );
}

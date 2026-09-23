import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import {
  createNavigationSnapshot,
  getNavigationSnapshot,
  isSwipeBackEdgeStart,
  restoreSnapshotScroll,
} from "../navigation/swipe-back";

const INTENT_THRESHOLD_PX = 6;
const COMPLETE_DISTANCE_RATIO = 0.24;
const SETTLE_DURATION_MS = 190;

interface Gesture {
  active: boolean;
  lastTime: number;
  lastX: number;
  velocity: number;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  x: number;
}

export function useEditPlanSwipeBack(onBack: () => void): React.RefObject<HTMLElement | null> {
  const router = useRouter();
  const surfaceRef = useRef<HTMLElement>(null);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null) {
      return;
    }
    const boundSurface: HTMLElement = surface;

    let gesture: Gesture | null = null;
    let timer: number | undefined;
    let suppressClickUntil = 0;
    let committing = false;
    let underlay: HTMLDivElement | null = null;
    const snapshots = new Map<string, ReturnType<typeof createNavigationSnapshot>>();

    function pageKey(href: string): { key: string; level: number } {
      const url = new URL(href, window.location.origin);
      const level =
        url.searchParams.get("view") !== "versions" ? 0 : url.searchParams.has("version") ? 2 : 1;

      return { key: `${url.searchParams.get("day")}:${level}`, level };
    }

    function revealPreviousPage(): void {
      const current = pageKey(router.state.location.href);
      const snapshot =
        current.level === 0
          ? getNavigationSnapshot("/plan/edit")
          : snapshots.get(current.key.replace(/:[12]$/, `:${current.level - 1}`));
      if (snapshot === undefined) {
        return;
      }
      underlay = document.createElement("div");
      underlay.className = "edit-plan-swipe-underlay";
      underlay.setAttribute("aria-hidden", "true");
      underlay.setAttribute("inert", "");
      underlay.append(snapshot.node);
      boundSurface.before(underlay);
      restoreSnapshotScroll(snapshot);
    }

    function reset(): void {
      window.clearTimeout(timer);
      timer = undefined;
      committing = false;
      underlay?.remove();
      underlay = null;
      const previous = gesture;
      gesture = null;
      if (previous !== null && boundSurface.hasPointerCapture(previous.pointerId)) {
        boundSurface.releasePointerCapture(previous.pointerId);
      }
      boundSurface.classList.remove("edit-plan--swiping", "edit-plan--swipe-settling");
      boundSurface.style.removeProperty("--edit-plan-swipe-x");
    }

    function settle(complete: boolean, width: number): void {
      boundSurface.classList.add("edit-plan--swipe-settling");
      boundSurface.style.setProperty("--edit-plan-swipe-x", `${complete ? width : 0}px`);
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 1
        : SETTLE_DURATION_MS;
      timer = window.setTimeout(() => {
        if (complete) {
          committing = true;
          onBackRef.current();
        } else {
          reset();
        }
      }, duration);
    }

    function start(event: PointerEvent): void {
      if (!event.isPrimary) {
        cancelSwipe();

        return;
      }
      if (timer !== undefined) {
        return;
      }
      const target = event.target;
      const bounds = boundSurface.getBoundingClientRect();
      if (
        event.button !== 0 ||
        !(target instanceof Element) ||
        target.closest("button, input, textarea, select, [contenteditable='true'], dialog") !==
          null ||
        boundSurface.querySelector("dialog[open]") !== null ||
        !isSwipeBackEdgeStart(event.clientX, bounds.left)
      ) {
        return;
      }

      gesture = {
        active: false,
        lastTime: event.timeStamp,
        lastX: event.clientX,
        velocity: 0,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: bounds.width,
        x: 0,
      };
    }

    function move(event: PointerEvent): void {
      if (gesture === null || event.pointerId !== gesture.pointerId) {
        return;
      }
      const deltaX = event.clientX - gesture.startX;
      const deltaY = Math.abs(event.clientY - gesture.startY);
      if (!gesture.active) {
        if (deltaX < -INTENT_THRESHOLD_PX || deltaY > Math.max(INTENT_THRESHOLD_PX, deltaX)) {
          gesture = null;

          return;
        }
        if (deltaX < INTENT_THRESHOLD_PX || deltaX <= deltaY * 1.15) {
          return;
        }
        gesture.active = true;
        revealPreviousPage();
        boundSurface.setPointerCapture(event.pointerId);
        boundSurface.classList.add("edit-plan--swiping");
        window.getSelection()?.removeAllRanges();
      }

      event.preventDefault();
      const elapsed = event.timeStamp - gesture.lastTime;
      if (elapsed > 0) {
        gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
      }
      gesture.lastTime = event.timeStamp;
      gesture.lastX = event.clientX;
      gesture.x = Math.max(0, Math.min(deltaX, gesture.width));
      boundSurface.style.setProperty("--edit-plan-swipe-x", `${gesture.x}px`);
    }

    function finish(event: PointerEvent): void {
      const completedGesture = gesture;
      if (completedGesture === null || event.pointerId !== completedGesture.pointerId) {
        return;
      }
      gesture = null;
      if (boundSurface.hasPointerCapture(event.pointerId)) {
        boundSurface.releasePointerCapture(event.pointerId);
      }
      if (!completedGesture.active) {
        return;
      }

      event.preventDefault();
      suppressClickUntil = performance.now() + 500;
      const velocity =
        event.timeStamp - completedGesture.lastTime < 100 ? completedGesture.velocity : 0;
      settle(
        completedGesture.x >= completedGesture.width * COMPLETE_DISTANCE_RATIO ||
          (completedGesture.x >= 18 && velocity >= 0.35),
        completedGesture.width,
      );
    }

    function click(event: MouseEvent): void {
      if (timer !== undefined || performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function cancelSwipe(): void {
      const previous = gesture;
      gesture = null;
      if (previous === null) {
        return;
      }
      if (boundSurface.hasPointerCapture(previous.pointerId)) {
        boundSurface.releasePointerCapture(previous.pointerId);
      }
      if (previous.active) {
        settle(false, previous.width);
      }
    }

    function cancel(event: PointerEvent): void {
      if (gesture?.pointerId === event.pointerId) {
        cancelSwipe();
      }
    }

    function lostCapture(event: PointerEvent): void {
      if (event.target === boundSurface) {
        cancel(event);
      }
    }

    boundSurface.addEventListener("pointerdown", start);
    boundSurface.addEventListener("pointermove", move);
    boundSurface.addEventListener("pointerup", finish);
    boundSurface.addEventListener("pointercancel", cancel);
    boundSurface.addEventListener("lostpointercapture", lostCapture);
    boundSurface.addEventListener("click", click, true);
    const unsubscribeBeforeNavigate = router.subscribe(
      "onBeforeNavigate",
      ({ fromLocation, toLocation }) => {
        if (fromLocation?.pathname === "/plan/edit" && toLocation.pathname === "/plan/edit") {
          const from = pageKey(fromLocation.href);
          const to = pageKey(toLocation.href);
          if (to.level > from.level) {
            snapshots.set(
              from.key,
              createNavigationSnapshot(boundSurface, fromLocation.href, toLocation.href),
            );
          }
        }
        if (!committing) {
          reset();
        }
      },
    );
    const unsubscribeRendered = router.subscribe("onRendered", reset);

    return () => {
      reset();
      unsubscribeBeforeNavigate();
      unsubscribeRendered();
      boundSurface.removeEventListener("pointerdown", start);
      boundSurface.removeEventListener("pointermove", move);
      boundSurface.removeEventListener("pointerup", finish);
      boundSurface.removeEventListener("pointercancel", cancel);
      boundSurface.removeEventListener("lostpointercapture", lostCapture);
      boundSurface.removeEventListener("click", click, true);
    };
  }, [router]);

  return surfaceRef;
}

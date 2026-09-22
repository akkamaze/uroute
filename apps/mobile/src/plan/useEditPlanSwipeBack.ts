import { useEffect, useRef } from "react";

import { isSwipeBackEdgeStart } from "../navigation/swipe-back";

const INTENT_THRESHOLD_PX = 6;
const COMPLETE_DISTANCE_RATIO = 0.24;
const SETTLE_DURATION_MS = 190;

interface Gesture {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  x: number;
}

export function useEditPlanSwipeBack(onBack: () => void): React.RefObject<HTMLElement | null> {
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

    function reset(): void {
      window.clearTimeout(timer);
      timer = undefined;
      gesture = null;
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
        reset();
        if (complete) {
          onBackRef.current();
        }
      }, duration);
    }

    function start(event: PointerEvent): void {
      if (timer !== undefined) {
        return;
      }
      const target = event.target;
      const bounds = boundSurface.getBoundingClientRect();
      if (
        !event.isPrimary ||
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
        boundSurface.setPointerCapture(event.pointerId);
        boundSurface.classList.add("edit-plan--swiping");
      }

      event.preventDefault();
      gesture.x = Math.max(0, Math.min(deltaX, gesture.width));
      boundSurface.style.setProperty("--edit-plan-swipe-x", `${gesture.x}px`);
    }

    function finish(event: PointerEvent): void {
      const completedGesture = gesture;
      if (completedGesture === null || event.pointerId !== completedGesture.pointerId) {
        return;
      }
      if (boundSurface.hasPointerCapture(event.pointerId)) {
        boundSurface.releasePointerCapture(event.pointerId);
      }
      gesture = null;
      if (!completedGesture.active) {
        return;
      }

      event.preventDefault();
      settle(
        completedGesture.x >= completedGesture.width * COMPLETE_DISTANCE_RATIO,
        completedGesture.width,
      );
    }

    function cancel(event: PointerEvent): void {
      if (gesture?.pointerId === event.pointerId) {
        const width = gesture.width;
        gesture = null;
        if (boundSurface.hasPointerCapture(event.pointerId)) {
          boundSurface.releasePointerCapture(event.pointerId);
        }
        settle(false, width);
      }
    }

    boundSurface.addEventListener("pointerdown", start);
    boundSurface.addEventListener("pointermove", move);
    boundSurface.addEventListener("pointerup", finish);
    boundSurface.addEventListener("pointercancel", cancel);

    return () => {
      reset();
      boundSurface.removeEventListener("pointerdown", start);
      boundSurface.removeEventListener("pointermove", move);
      boundSurface.removeEventListener("pointerup", finish);
      boundSurface.removeEventListener("pointercancel", cancel);
    };
  }, []);

  return surfaceRef;
}

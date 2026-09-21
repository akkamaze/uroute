import { useRouter } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";

import {
  captureNavigationSnapshot,
  getNavigationSnapshot,
  isSwipeBackEdgeStart,
  restoreSnapshotScroll,
  shouldCaptureForwardNavigation,
  subscribeNavigationSnapshots,
  synchronizeNavigationSnapshots,
} from "./swipe-back";

const INTENT_THRESHOLD_PX = 5;
const COMPLETE_DISTANCE_RATIO = 0.24;
const COMPLETE_VELOCITY_PX_PER_MS = 0.35;
const SETTLE_DURATION_MS = 190;

interface Gesture {
  active: boolean;
  lastTime: number;
  lastX: number;
  pointerId: number;
  startX: number;
  startY: number;
  velocity: number;
  width: number;
  x: number;
}

export function useSwipeBack(): {
  backdropRef: React.RefObject<HTMLDivElement | null>;
  navigationRef: React.RefObject<HTMLDivElement | null>;
} {
  const router = useRouter();
  const navigationRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const navigationElement = navigationRef.current;
    const backdropElement = backdropRef.current;
    const surfaceElement = navigationElement?.querySelector<HTMLElement>(
      ".app-navigation__surface",
    );

    if (
      navigationElement === null ||
      backdropElement === null ||
      surfaceElement === null ||
      surfaceElement === undefined
    ) {
      return;
    }

    const navigation = navigationElement;
    const backdrop = backdropElement;
    const surface = surfaceElement;

    let gesture: Gesture | null = null;
    let phase: "idle" | "dragging" | "back" | "reset" | "committing" = "idle";
    let frame: number | undefined;
    let settleTimer: number | undefined;
    let suppressClickUntil = 0;
    let destination: string | undefined;

    function cancelFrame(): void {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
      }
    }

    function clearSettleTimer(): void {
      window.clearTimeout(settleTimer);
      settleTimer = undefined;
    }

    function setPhase(next: typeof phase): void {
      phase = next;
      navigation.dataset.swipePhase = next;
    }

    function renderPosition(x: number, width = navigation.clientWidth): void {
      navigation.style.setProperty("--back-translate", `${x}px`);
      navigation.style.setProperty("--back-progress", String(x / Math.max(1, width)));
    }

    function releaseGesture(): void {
      const previous = gesture;
      gesture = null;

      if (previous !== null && navigation.hasPointerCapture(previous.pointerId)) {
        navigation.releasePointerCapture(previous.pointerId);
      }
    }

    function reset(): void {
      cancelFrame();
      clearSettleTimer();
      releaseGesture();
      destination = undefined;
      setPhase("idle");
      renderPosition(0);
    }

    function updateBackdrop(): void {
      // Keep the revealed page mounted until the destination has actually rendered.
      if (phase !== "idle") {
        return;
      }

      const snapshot = getNavigationSnapshot(router.state.location.pathname);
      backdrop.replaceChildren();

      if (snapshot !== undefined) {
        backdrop.append(snapshot.node);
        restoreSnapshotScroll(snapshot);
      }
    }

    function completeSettle(): void {
      clearSettleTimer();

      if (phase === "reset") {
        reset();
        updateBackdrop();
      } else if (phase === "back") {
        // history.back is asynchronous: never reveal the outgoing route at x=0 here.
        setPhase("committing");
        router.history.back();
      }
    }

    function settle(complete: boolean, width: number): void {
      cancelFrame();
      setPhase(complete ? "back" : "reset");
      // Flush the last drag position before setting the CSS transition target.
      surface.getBoundingClientRect();
      renderPosition(complete ? width : 0, width);
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 1
        : SETTLE_DURATION_MS;
      settleTimer = window.setTimeout(completeSettle, duration + 50);
    }

    function cancelSwipe(): void {
      const previous = gesture;
      releaseGesture();

      if (previous?.active) {
        settle(false, previous.width);
      }
    }

    function start(event: PointerEvent): void {
      if (!event.isPrimary) {
        cancelSwipe();

        return;
      }

      const snapshot = getNavigationSnapshot(router.state.location.pathname);
      const target = event.target;
      const bounds = navigation.getBoundingClientRect();

      if (
        phase !== "idle" ||
        surface.querySelector("dialog[open], [role='dialog'][aria-modal='true']") !== null ||
        snapshot === undefined ||
        event.button !== 0 ||
        !(target instanceof Element) ||
        !isSwipeBackEdgeStart(event.clientX, bounds.left) ||
        target.closest(
          "input, textarea, select, [contenteditable='true'], .trip-map, .bottom-navigation, .place-sheet__handle-button, [data-swipe-back-ignore]",
        ) !== null ||
        (event.pointerType === "mouse" && target.closest(".timeline__stop") !== null)
      ) {
        return;
      }

      destination = snapshot.fromPath;
      gesture = {
        active: false,
        lastTime: event.timeStamp,
        lastX: event.clientX,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        velocity: 0,
        width: bounds.width,
        x: 0,
      };
    }

    function move(event: PointerEvent): void {
      if (gesture === null || gesture.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = Math.abs(event.clientY - gesture.startY);

      if (!gesture.active) {
        if (
          event.target instanceof Element &&
          event.target.closest(".timeline__stop--dragging") !== null
        ) {
          releaseGesture();

          return;
        }

        if (deltaX < -INTENT_THRESHOLD_PX || deltaY > Math.max(INTENT_THRESHOLD_PX, deltaX)) {
          releaseGesture();

          return;
        }

        if (deltaX < INTENT_THRESHOLD_PX || deltaX <= deltaY * 1.15) {
          return;
        }

        gesture.active = true;
        navigation.setPointerCapture(event.pointerId);
        window.getSelection()?.removeAllRanges();
        setPhase("dragging");
      }

      event.preventDefault();
      event.stopPropagation();
      const elapsed = event.timeStamp - gesture.lastTime;

      if (elapsed > 0) {
        gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
      }

      gesture.lastTime = event.timeStamp;
      gesture.lastX = event.clientX;
      gesture.x = Math.max(0, Math.min(deltaX, gesture.width));

      if (frame === undefined) {
        frame = window.requestAnimationFrame(() => {
          frame = undefined;

          if (gesture !== null) {
            renderPosition(gesture.x, gesture.width);
          }
        });
      }
    }

    function finish(event: PointerEvent): void {
      const previous = gesture;

      if (previous === null || previous.pointerId !== event.pointerId) {
        return;
      }

      releaseGesture();

      if (!previous.active) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = performance.now() + 500;
      cancelFrame();
      renderPosition(previous.x, previous.width);
      const velocity = event.timeStamp - previous.lastTime < 100 ? previous.velocity : 0;
      const complete =
        previous.x >= previous.width * COMPLETE_DISTANCE_RATIO ||
        (previous.x >= INTENT_THRESHOLD_PX * 3 && velocity >= COMPLETE_VELOCITY_PX_PER_MS);
      settle(complete, previous.width);
    }

    function cancel(event: PointerEvent): void {
      if (gesture?.pointerId === event.pointerId) {
        cancelSwipe();
      }
    }

    function lostCapture(event: PointerEvent): void {
      if (event.target === navigation) {
        cancel(event);
      }
    }

    function click(event: MouseEvent): void {
      if (phase !== "idle" || performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();

        return;
      }

      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;

      if (anchor === null) {
        return;
      }

      const target = new URL(anchor.href, window.location.href);

      if (
        target.origin === window.location.origin &&
        shouldCaptureForwardNavigation(router.state.location.pathname, target.pathname)
      ) {
        captureNavigationSnapshot(target.pathname);
      }
    }

    function transitionEnd(event: TransitionEvent): void {
      if (event.target === surface && event.propertyName === "transform") {
        completeSettle();
      }
    }

    const unsubscribeSnapshots = subscribeNavigationSnapshots(updateBackdrop);
    const unsubscribeBeforeNavigate = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      if (phase !== "committing" || toLocation.pathname !== destination) {
        reset();
      }
    });
    const unsubscribeRendered = router.subscribe("onRendered", ({ toLocation }) => {
      reset();
      synchronizeNavigationSnapshots(toLocation.pathname);
      updateBackdrop();
    });

    updateBackdrop();
    navigation.addEventListener("pointerdown", start, true);
    navigation.addEventListener("pointermove", move, true);
    navigation.addEventListener("pointerup", finish, true);
    navigation.addEventListener("pointercancel", cancel, true);
    navigation.addEventListener("lostpointercapture", lostCapture, true);
    navigation.addEventListener("click", click, true);
    surface.addEventListener("transitionend", transitionEnd);

    return () => {
      reset();
      unsubscribeSnapshots();
      unsubscribeBeforeNavigate();
      unsubscribeRendered();
      navigation.removeEventListener("pointerdown", start, true);
      navigation.removeEventListener("pointermove", move, true);
      navigation.removeEventListener("pointerup", finish, true);
      navigation.removeEventListener("pointercancel", cancel, true);
      navigation.removeEventListener("lostpointercapture", lostCapture, true);
      navigation.removeEventListener("click", click, true);
      surface.removeEventListener("transitionend", transitionEnd);
    };
  }, [router]);

  return { backdropRef, navigationRef };
}

import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { NavigationIcon, type NavigationIconName } from "./icons/NavigationIcon";
import {
  captureNavigationSnapshot,
  consumeNavigationSnapshot,
  getNavigationSnapshot,
  restoreSnapshotScroll,
  shouldCaptureForwardNavigation,
  subscribeNavigationSnapshots,
  synchronizeNavigationSnapshots,
} from "./navigation/swipe-back";
import { preferPortraitOrientation } from "./orientation";

const DRAG_INTENT_THRESHOLD_PX = 5;
const COMPLETE_DISTANCE_RATIO = 0.24;
const COMPLETE_VELOCITY_PX_PER_MS = 0.35;
const SETTLE_DURATION_MS = 190;

const navigationItems = [
  { icon: "trips", label: "Trips", to: "/trips" },
  { icon: "saved", label: "Saved", to: "/saved" },
  { icon: "journal", label: "Journal", to: "/journal" },
  { icon: "you", label: "You", to: "/user" },
] as const satisfies readonly {
  icon: NavigationIconName;
  label: string;
  to: string;
}[];

function isNavigationItemActive(to: string, pathname: string): boolean {
  return (
    pathname === to || (to === "/trips" && ["/bookings", "/expenses", "/plan"].includes(pathname))
  );
}

export function AppRoot(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const snapshot = useSyncExternalStore(
    subscribeNavigationSnapshots,
    () => getNavigationSnapshot(pathname),
    () => undefined,
  );
  const backdropRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    active: boolean;
    pointerId: number;
    startTime: number;
    startX: number;
    startY: number;
    x: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState<"back" | "idle" | "reset">("idle");
  useEffect(() => {
    synchronizeNavigationSnapshots(pathname);
  }, [pathname]);

  useEffect(() => {
    const backdrop = backdropRef.current;

    if (backdrop === null) {
      return;
    }

    backdrop.replaceChildren();

    if (snapshot !== undefined) {
      backdrop.append(snapshot.node);
      window.requestAnimationFrame(() => restoreSnapshotScroll(snapshot));
    }
  }, [snapshot]);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    },
    [],
  );

  function renderDragPosition(x: number): void {
    const navigation = navigationRef.current;

    if (navigation === null) {
      return;
    }

    const clampedX = Math.max(0, Math.min(x, window.innerWidth));
    navigation.style.setProperty("--back-translate", `${clampedX}px`);
    navigation.style.setProperty(
      "--back-progress",
      String(clampedX / Math.max(1, window.innerWidth)),
    );
  }

  function scheduleDragPosition(x: number): void {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      renderDragPosition(x);
    });
  }

  function captureLinkNavigation(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");

    if (anchor === null) {
      return;
    }

    const target = new URL(anchor.href, window.location.href);

    if (
      target.origin === window.location.origin &&
      shouldCaptureForwardNavigation(pathname, target.pathname)
    ) {
      captureNavigationSnapshot(target.pathname);
    }
  }

  function startSwipeBack(event: React.PointerEvent<HTMLDivElement>): void {
    const target = event.target as Element;

    if (snapshot === undefined || event.isPrimary === false) {
      return;
    }

    if (
      target.closest(
        "input, textarea, select, [contenteditable='true'], .maplibregl-canvas-container, [data-swipe-back-ignore]",
      ) !== null
    ) {
      return;
    }

    gestureRef.current = {
      active: false,
      pointerId: event.pointerId,
      startTime: performance.now(),
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
    };
    setSettling("idle");
  }

  function moveSwipeBack(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;

    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = Math.max(0, event.clientX - gesture.startX);
    const deltaY = Math.abs(event.clientY - gesture.startY);

    if (!gesture.active) {
      if (deltaY > DRAG_INTENT_THRESHOLD_PX && deltaY > deltaX * 1.15) {
        gestureRef.current = null;

        return;
      }

      if (deltaX < DRAG_INTENT_THRESHOLD_PX || deltaX <= deltaY * 1.15) {
        return;
      }

      gesture.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
      setDragging(true);
    }

    event.preventDefault();
    gesture.x = Math.min(deltaX, window.innerWidth);
    scheduleDragPosition(gesture.x);
  }

  function finishSwipeBack(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;

    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }

    gestureRef.current = null;

    if (!gesture.active) {
      return;
    }

    setDragging(false);

    const elapsed = Math.max(1, performance.now() - gesture.startTime);
    const velocity = gesture.x / elapsed;
    const complete =
      gesture.x >= window.innerWidth * COMPLETE_DISTANCE_RATIO ||
      velocity >= COMPLETE_VELOCITY_PX_PER_MS;

    if (!complete) {
      setSettling("reset");
      window.requestAnimationFrame(() => renderDragPosition(0));
      window.setTimeout(() => setSettling("idle"), SETTLE_DURATION_MS);

      return;
    }

    setSettling("back");
    window.requestAnimationFrame(() => renderDragPosition(window.innerWidth));
    window.setTimeout(() => {
      consumeNavigationSnapshot(pathname);
      window.history.back();
      renderDragPosition(0);
      setSettling("idle");
    }, SETTLE_DURATION_MS);
  }

  return (
    <div
      className={[
        "app-navigation",
        dragging ? "app-navigation--dragging" : "",
        settling !== "idle" ? `app-navigation--${settling}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClickCapture={captureLinkNavigation}
      onPointerCancelCapture={finishSwipeBack}
      onPointerDownCapture={startSwipeBack}
      onPointerMoveCapture={moveSwipeBack}
      onPointerUpCapture={finishSwipeBack}
      ref={navigationRef}
    >
      <div className="app-navigation__backdrop" ref={backdropRef} />
      <div className={`app-navigation__surface app-navigation__surface--${settling}`}>
        <Outlet />
      </div>
    </div>
  );
}

export function MobileShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    preferPortraitOrientation();
  }, [pathname]);

  return (
    <div className="mobile-shell">
      <main className="mobile-shell__main" data-scroll-restoration-id="mobile-main">
        <Outlet />
      </main>

      <nav aria-label="Primary" className="bottom-navigation">
        {navigationItems.map(({ icon, label, to }) => {
          const active = isNavigationItemActive(to, pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`bottom-navigation__link${active ? " bottom-navigation__link--active" : ""}`}
              key={to}
              to={to}
            >
              <NavigationIcon active={active} name={icon} />

              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function RootRedirect(): React.JSX.Element {
  return <Navigate replace to="/loading" />;
}

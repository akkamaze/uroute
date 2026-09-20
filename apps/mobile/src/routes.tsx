import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { NavigationIcon, type NavigationIconName } from "./icons/NavigationIcon";
import {
  captureNavigationSnapshot,
  consumeNavigationSnapshot,
  getNavigationSnapshot,
  shouldCaptureForwardNavigation,
  subscribeNavigationSnapshots,
  synchronizeNavigationSnapshots,
} from "./navigation/swipe-back";
import { preferPortraitOrientation } from "./orientation";

const EDGE_GESTURE_WIDTH_PX = 28;
const DRAG_INTENT_THRESHOLD_PX = 8;
const COMPLETE_DISTANCE_RATIO = 0.38;
const COMPLETE_VELOCITY_PX_PER_MS = 0.65;

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
  const gestureRef = useRef<{
    active: boolean;
    pointerId: number;
    startTime: number;
    startX: number;
    startY: number;
    x: number;
  } | null>(null);
  const [dragX, setDragX] = useState(0);
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
    }
  }, [snapshot]);

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
    if (
      snapshot === undefined ||
      event.clientX > EDGE_GESTURE_WIDTH_PX ||
      event.isPrimary === false
    ) {
      return;
    }

    if (event.pointerType === "mouse") {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    }

    gestureRef.current = {
      active: false,
      pointerId: event.pointerId,
      startTime: performance.now(),
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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
      if (deltaY > DRAG_INTENT_THRESHOLD_PX && deltaY > deltaX) {
        gestureRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);

        return;
      }

      if (deltaX < DRAG_INTENT_THRESHOLD_PX || deltaX <= deltaY) {
        return;
      }

      gesture.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    gesture.x = Math.min(deltaX, window.innerWidth);
    setDragX(gesture.x);
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

    const elapsed = Math.max(1, performance.now() - gesture.startTime);
    const velocity = gesture.x / elapsed;
    const complete =
      gesture.x >= window.innerWidth * COMPLETE_DISTANCE_RATIO ||
      velocity >= COMPLETE_VELOCITY_PX_PER_MS;

    if (!complete) {
      setSettling("reset");
      setDragX(0);
      window.setTimeout(() => setSettling("idle"), 220);

      return;
    }

    setSettling("back");
    setDragX(window.innerWidth);
    window.setTimeout(() => {
      consumeNavigationSnapshot(pathname);
      window.history.back();
      setDragX(0);
      setSettling("idle");
    }, 220);
  }

  const progress = Math.min(1, dragX / Math.max(1, window.innerWidth));

  return (
    <div
      className={`app-navigation${dragX > 0 ? " app-navigation--dragging" : ""}`}
      onClickCapture={captureLinkNavigation}
      style={
        {
          "--back-progress": progress,
          "--back-translate": `${dragX}px`,
        } as React.CSSProperties
      }
    >
      <div className="app-navigation__backdrop" ref={backdropRef} />
      <div className={`app-navigation__surface app-navigation__surface--${settling}`}>
        <Outlet />
      </div>
      {snapshot === undefined ? null : (
        <div
          aria-hidden="true"
          className="app-navigation__edge"
          onPointerCancel={finishSwipeBack}
          onPointerDown={startSwipeBack}
          onPointerMove={moveSwipeBack}
          onPointerUp={finishSwipeBack}
        />
      )}
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

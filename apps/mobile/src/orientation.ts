type OrientationMode = "any" | "portrait-primary";

interface LockableScreenOrientation {
  lock?: (orientation: OrientationMode) => Promise<void>;
  unlock?: () => void;
}

function setOrientationPolicy(policy: "any" | "portrait"): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.orientationPolicy = policy;
  }
}

function getOrientation(): LockableScreenOrientation | null {
  if (typeof screen === "undefined" || screen.orientation === undefined) {
    return null;
  }

  const orientation: LockableScreenOrientation = screen.orientation;

  return orientation;
}

export function allowAnyOrientation(): void {
  setOrientationPolicy("any");
  const orientation = getOrientation();

  if (orientation === null) {
    return;
  }

  try {
    if (typeof orientation.lock === "function") {
      void orientation.lock.call(orientation, "any").catch(() => undefined);
    } else if (typeof orientation.unlock === "function") {
      orientation.unlock.call(orientation);
    }
  } catch {
    // Safari can expose a partial Screen Orientation API that throws when called.
  }
}

export function preferPortraitOrientation(): void {
  setOrientationPolicy("portrait");
  const orientation = getOrientation();

  if (typeof orientation?.lock !== "function") {
    return;
  }

  try {
    void orientation.lock.call(orientation, "portrait-primary").catch(() => undefined);
  } catch {
    // The CSS orientation guard remains active when native locking is unavailable.
  }
}

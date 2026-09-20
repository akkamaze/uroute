type OrientationMode = "any" | "portrait-primary";

interface LockableScreenOrientation extends ScreenOrientation {
  lock?: (orientation: OrientationMode) => Promise<void>;
}

function getOrientation(): LockableScreenOrientation | null {
  if (typeof screen === "undefined" || screen.orientation === undefined) {
    return null;
  }

  const orientation: LockableScreenOrientation = screen.orientation;

  return orientation;
}

export function allowAnyOrientation(): void {
  const orientation = getOrientation();

  if (orientation === null) {
    return;
  }

  if (orientation.lock !== undefined) {
    void orientation.lock("any").catch(() => undefined);
  } else {
    orientation.unlock();
  }
}

export function preferPortraitOrientation(): void {
  const orientation = getOrientation();

  if (orientation?.lock === undefined) {
    return;
  }

  void orientation.lock("portrait-primary").catch(() => undefined);
}

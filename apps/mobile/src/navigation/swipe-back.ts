interface NavigationSnapshot {
  fromPath: string;
  node: HTMLElement;
  scrollOffsets: Array<{ index: number; left: number; top: number }>;
  toPath: string;
}

const snapshots: NavigationSnapshot[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function copyCanvasPixels(source: HTMLElement, clone: HTMLElement): void {
  const sourceCanvases = source.querySelectorAll("canvas");
  const clonedCanvases = clone.querySelectorAll("canvas");

  sourceCanvases.forEach((canvas, index) => {
    const clonedCanvas = clonedCanvases[index];

    if (clonedCanvas === undefined) {
      return;
    }

    clonedCanvas.width = canvas.width;
    clonedCanvas.height = canvas.height;

    try {
      clonedCanvas.getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {
      // A map can still use its styled background if a browser protects the tile canvas.
    }
  });
}

function getVisiblePage(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".app-navigation__surface > *");
}

export function shouldCaptureForwardNavigation(fromPath: string, toPath: string): boolean {
  if (fromPath === "/trips") {
    return ["/plan", "/bookings", "/expenses"].includes(toPath);
  }

  return ["/plan", "/saved"].includes(fromPath) && toPath === "/places";
}

export function captureNavigationSnapshot(toPath: string): void {
  const source = getVisiblePage();
  const fromPath = window.location.pathname;

  if (source === null || !shouldCaptureForwardNavigation(fromPath, toPath)) {
    return;
  }

  const node = source.cloneNode(true) as HTMLElement;
  const sourceElements = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const scrollOffsets = sourceElements.flatMap((element, index) =>
    element.scrollTop === 0 && element.scrollLeft === 0
      ? []
      : [{ index, left: element.scrollLeft, top: element.scrollTop }],
  );
  copyCanvasPixels(source, node);
  node.removeAttribute("id");
  node.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  node.querySelectorAll("[data-scroll-restoration-id]").forEach((element) => {
    element.removeAttribute("data-scroll-restoration-id");
  });
  node.querySelectorAll("video").forEach((video) => video.pause());
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("inert", "");

  snapshots.push({ fromPath, node, scrollOffsets, toPath });
  notify();
}

export function getNavigationSnapshot(pathname: string): NavigationSnapshot | undefined {
  return snapshots.at(-1)?.toPath === pathname ? snapshots.at(-1) : undefined;
}

export function restoreSnapshotScroll(snapshot: NavigationSnapshot): void {
  const clonedElements = [snapshot.node, ...snapshot.node.querySelectorAll<HTMLElement>("*")];

  snapshot.scrollOffsets.forEach(({ index, left, top }) => {
    const element = clonedElements[index];

    if (element !== undefined) {
      element.scrollTo({ left, top });
    }
  });
}

export function synchronizeNavigationSnapshots(pathname: string): void {
  let changed = false;

  while (snapshots.at(-1)?.fromPath === pathname) {
    snapshots.pop();
    changed = true;
  }

  if (changed) {
    notify();
  }
}

export function subscribeNavigationSnapshots(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

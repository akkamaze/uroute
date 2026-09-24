interface DragCallbacks {
  onDrag: (delta: number) => void;
  onRelease: (delta: number, duration: number) => void;
  onCancel: () => void;
  allowUpwardFrom?: (target: Element) => boolean;
}

interface ContentGesture {
  kind: "pointer" | "touch";
  id: number;
  startX: number;
  startY: number;
  startedAt: number;
  delta: number;
  active: boolean;
  allowUpward: boolean;
}

const INTERACTIVE =
  "button, a, input, textarea, select, summary, label, [data-sheet-drag-ignore], [role='button'], [role='link'], [contenteditable='true']";
const INTENT_PX = 6;

export function attachContentSheetDrag(content: HTMLElement, callbacks: DragCallbacks): () => void {
  let gesture: ContentGesture | null = null;

  function cancel(): void {
    const previous = gesture;
    gesture = null;
    if (previous?.active) {
      callbacks.onCancel();
    }
  }

  function start(
    target: EventTarget | null,
    kind: ContentGesture["kind"],
    id: number,
    x: number,
    y: number,
  ): void {
    cancel();
    if (!(target instanceof Element)) {
      return;
    }
    const allowUpward = callbacks.allowUpwardFrom?.(target) ?? false;
    if (target.closest(INTERACTIVE) !== null && !allowUpward) {
      return;
    }
    gesture = {
      kind,
      id,
      startX: x,
      startY: y,
      startedAt: performance.now(),
      delta: 0,
      active: false,
      allowUpward,
    };
  }

  function move(event: Event, x: number, y: number): void {
    if (gesture === null) {
      return;
    }
    if (!gesture.active) {
      const horizontal = Math.abs(x - gesture.startX);
      const vertical = y - gesture.startY;
      if (horizontal > INTENT_PX && horizontal > Math.abs(vertical)) {
        gesture = null;

        return;
      }
      if (content.scrollTop > 1 && !gesture.allowUpward) {
        // Keep native scroll ownership; only movement after reaching the top may drag the sheet.
        gesture.startY = y;
        gesture.startedAt = performance.now();

        return;
      }
      const intent = gesture.allowUpward ? Math.abs(vertical) : vertical;
      if (intent <= INTENT_PX || intent <= horizontal * 1.15) {
        return;
      }
      if (!event.cancelable) {
        // A browser-owned scroll must never move the sheet at the same time.
        gesture = null;

        return;
      }
      gesture.active = true;
      if (gesture.kind === "pointer" && !gesture.allowUpward) {
        content.setPointerCapture(gesture.id);
      }
    }
    event.preventDefault();
    event.stopPropagation();
    gesture.delta = gesture.allowUpward ? y - gesture.startY : Math.max(0, y - gesture.startY);
    callbacks.onDrag(gesture.delta);
  }

  function finish(): void {
    const previous = gesture;
    gesture = null;
    if (previous?.active) {
      callbacks.onRelease(previous.delta, performance.now() - previous.startedAt);
    }
  }

  function pointerDown(event: PointerEvent): void {
    if (event.pointerType !== "touch" && event.button === 0) {
      start(event.target, "pointer", event.pointerId, event.clientX, event.clientY);
      if (gesture?.allowUpward) {
        const handle = event.target as Element & {
          setPointerCapture?: (pointerId: number) => void;
        };
        (handle.setPointerCapture === undefined ? content : handle).setPointerCapture(
          event.pointerId,
        );
      }
    }
  }
  function pointerMove(event: PointerEvent): void {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) {
      move(event, event.clientX, event.clientY);
    }
  }
  function pointerUp(event: PointerEvent): void {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) {
      finish();
    }
  }
  function pointerCancel(event: PointerEvent): void {
    if (gesture?.kind === "pointer" && gesture.id === event.pointerId) {
      cancel();
    }
  }
  function touchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch === undefined) {
      cancel();

      return;
    }
    start(event.target, "touch", touch.identifier, touch.clientX, touch.clientY);
  }
  function touchMove(event: TouchEvent): void {
    if (gesture?.kind !== "touch") {
      return;
    }
    if (event.touches.length !== 1) {
      cancel();

      return;
    }
    const touch = Array.from(event.touches).find((item) => item.identifier === gesture?.id);
    if (touch !== undefined) {
      move(event, touch.clientX, touch.clientY);
    }
  }
  function touchEnd(): void {
    if (gesture?.kind === "touch") {
      finish();
    }
  }

  content.addEventListener("pointerdown", pointerDown);
  content.addEventListener("pointermove", pointerMove);
  content.addEventListener("pointerup", pointerUp);
  content.addEventListener("pointercancel", pointerCancel);
  content.addEventListener("lostpointercapture", pointerCancel);
  content.addEventListener("touchstart", touchStart, { passive: true });
  content.addEventListener("touchmove", touchMove, { passive: false });
  content.addEventListener("touchend", touchEnd);
  content.addEventListener("touchcancel", cancel);

  return () => {
    cancel();
    content.removeEventListener("pointerdown", pointerDown);
    content.removeEventListener("pointermove", pointerMove);
    content.removeEventListener("pointerup", pointerUp);
    content.removeEventListener("pointercancel", pointerCancel);
    content.removeEventListener("lostpointercapture", pointerCancel);
    content.removeEventListener("touchstart", touchStart);
    content.removeEventListener("touchmove", touchMove);
    content.removeEventListener("touchend", touchEnd);
    content.removeEventListener("touchcancel", cancel);
  };
}

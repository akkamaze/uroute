interface ViewportMetrics {
  height: number;
  offsetTop: number;
  scale: number;
}

export interface KeyboardBounds {
  top: number;
  bottom: number;
  height: number;
  bottomInset: number;
  zoomed: boolean;
}

interface VerticalRect {
  top: number;
  bottom: number;
}

export function getKeyboardBounds(
  layoutHeight: number,
  viewport: ViewportMetrics | null,
  editing: boolean,
): KeyboardBounds {
  const height = Math.max(0, layoutHeight);
  const zoomed = viewport !== null && Math.abs(viewport.scale - 1) > 0.02;
  if (!editing || viewport === null || zoomed) {
    return { top: 0, bottom: height, height, bottomInset: 0, zoomed };
  }
  const top = Math.min(height, Math.max(0, viewport.offsetTop));
  const bottom = Math.min(height, Math.max(top, top + viewport.height));

  return { top, bottom, height: bottom - top, bottomInset: height - bottom, zoomed };
}

export function getRevealScrollTop(
  field: VerticalRect,
  owner: VerticalRect,
  current: number,
  maximum: number,
  bounds: KeyboardBounds,
  gap = 16,
): number {
  const top = Math.max(owner.top, bounds.top) + gap;
  const bottom = Math.min(owner.bottom, bounds.bottom) - gap;
  if (bottom <= top) {
    return current;
  }
  let delta = 0;
  if (field.bottom - field.top > bottom - top || field.top < top) {
    delta = field.top - top;
  } else if (field.bottom > bottom) {
    delta = field.bottom - bottom;
  }

  return Math.min(Math.max(0, maximum), Math.max(0, current + delta));
}

function editableField(): HTMLElement | null {
  const field = document.activeElement;
  if (field instanceof HTMLSelectElement) {
    return field.disabled ? null : field;
  }
  if (field instanceof HTMLTextAreaElement) {
    return field.disabled || field.readOnly ? null : field;
  }
  if (
    field instanceof HTMLInputElement &&
    !field.disabled &&
    !field.readOnly &&
    [
      "text",
      "search",
      "email",
      "url",
      "tel",
      "password",
      "number",
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
    ].includes(field.type)
  ) {
    return field;
  }

  return null;
}

export function attachKeyboardViewport(): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame: number | undefined;
  let settled: number | undefined;
  let userOwnsScroll = false;
  let lastField: HTMLElement | null = null;

  function readBounds(field: HTMLElement | null): KeyboardBounds {
    return getKeyboardBounds(window.innerHeight, viewport, field !== null);
  }

  function update(): void {
    frame = undefined;
    const field = editableField();
    const bounds = readBounds(field);
    root.style.setProperty("--keyboard-viewport-top", bounds.top + "px");
    root.style.setProperty("--keyboard-viewport-height", bounds.height + "px");
    root.style.setProperty("--keyboard-viewport-bottom", bounds.bottomInset + "px");
    root.toggleAttribute("data-keyboard-editing", field !== null && !bounds.zoomed);
  }

  function reveal(): void {
    settled = undefined;
    const field = editableField();
    if (field === null || !field.isConnected || userOwnsScroll) {
      return;
    }
    const owner = field.closest<HTMLElement>("[data-keyboard-scroll]");
    const bounds = readBounds(field);
    if (owner === null || bounds.zoomed || owner.scrollHeight <= owner.clientHeight) {
      return;
    }
    const next = getRevealScrollTop(
      field.getBoundingClientRect(),
      owner.getBoundingClientRect(),
      owner.scrollTop,
      owner.scrollHeight - owner.clientHeight,
      bounds,
    );
    if (Math.abs(next - owner.scrollTop) > 1) {
      // Change only the declared content owner, never the document or all ancestors.
      owner.scrollTop = next;
    }
  }

  function schedule(): void {
    if (frame === undefined) {
      frame = window.requestAnimationFrame(update);
    }
    window.clearTimeout(settled);
    settled = window.setTimeout(reveal, 140);
  }

  function focusChanged(): void {
    const next = editableField();
    if (next !== lastField) {
      lastField = next;
      userOwnsScroll = false;
    }
    schedule();
  }

  function preserveUserScroll(event: Event): void {
    const target = event.target;
    if (event.type === "pointerdown" && target === editableField()) {
      return;
    }
    if (target instanceof Element && target.closest("[data-keyboard-scroll]") !== null) {
      userOwnsScroll = true;
      window.clearTimeout(settled);
    }
  }

  document.addEventListener("focusin", focusChanged);
  document.addEventListener("focusout", focusChanged);
  document.addEventListener("pointerdown", preserveUserScroll, true);
  document.addEventListener("wheel", preserveUserScroll, { passive: true, capture: true });
  window.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  update();

  return () => {
    window.cancelAnimationFrame(frame ?? 0);
    window.clearTimeout(settled);
    document.removeEventListener("focusin", focusChanged);
    document.removeEventListener("focusout", focusChanged);
    document.removeEventListener("pointerdown", preserveUserScroll, true);
    document.removeEventListener("wheel", preserveUserScroll, true);
    window.removeEventListener("resize", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    root.style.removeProperty("--keyboard-viewport-top");
    root.style.removeProperty("--keyboard-viewport-height");
    root.style.removeProperty("--keyboard-viewport-bottom");
    root.removeAttribute("data-keyboard-editing");
  };
}

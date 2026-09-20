import { expect, test } from "bun:test";
import {
  attachKeyboardViewport,
  getKeyboardBounds,
  getRevealScrollTop,
} from "../src/keyboard/keyboard-viewport.ts";

const visible = { height: 430, offsetTop: 30, scale: 1 };
const bounds = getKeyboardBounds(844, visible, true);

test("visual viewport height and offset reserve the obscured bottom", () => {
  expect(bounds).toEqual({ top: 30, bottom: 460, height: 430, bottomInset: 384, zoomed: false });
});
test("layout-resizing keyboards do not subtract their height twice", () => {
  expect(getKeyboardBounds(430, { height: 430, offsetTop: 0, scale: 1 }, true).bottomInset).toBe(0);
});
test("blur, unavailable viewport and pinch zoom use layout fallback", () => {
  for (const value of [
    getKeyboardBounds(844, visible, false),
    getKeyboardBounds(844, null, true),
  ]) {
    expect(value).toEqual({ top: 0, bottom: 844, height: 844, bottomInset: 0, zoomed: false });
  }
  expect(getKeyboardBounds(844, { ...visible, scale: 2 }, true)).toEqual({
    top: 0,
    bottom: 844,
    height: 844,
    bottomInset: 0,
    zoomed: true,
  });
});
test("viewport offsets clamp safely to the layout", () => {
  expect(getKeyboardBounds(400, { height: 500, offsetTop: -20, scale: 1 }, true).height).toBe(400);
});
test("reveal moves the declared owner by only the necessary distance", () => {
  expect(
    getRevealScrollTop({ top: 500, bottom: 546 }, { top: 100, bottom: 700 }, 20, 600, bounds),
  ).toBe(122);
  expect(
    getRevealScrollTop({ top: 80, bottom: 126 }, { top: 100, bottom: 700 }, 80, 600, bounds),
  ).toBe(44);
  expect(
    getRevealScrollTop({ top: 200, bottom: 246 }, { top: 100, bottom: 700 }, 80, 600, bounds),
  ).toBe(80);
});
test("large textarea aligns its start; limits never overscroll the owner", () => {
  expect(
    getRevealScrollTop({ top: 200, bottom: 700 }, { top: 100, bottom: 700 }, 20, 600, bounds),
  ).toBe(104);
  expect(
    getRevealScrollTop({ top: 800, bottom: 846 }, { top: 100, bottom: 700 }, 20, 100, bounds),
  ).toBe(100);
  expect(
    getRevealScrollTop({ top: 0, bottom: 40 }, { top: 100, bottom: 700 }, 20, 100, bounds),
  ).toBe(0);
});

function wait() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 190));
}

test("controller reveals only an opted-in owner, preserves manual scrolling, resets on blur and cleans up", async () => {
  const keys = ["window", "document", "Element", "HTMLInputElement", "HTMLTextAreaElement"];
  const original = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  class Element extends globalThis.EventTarget {
    isConnected = true;
    closest() {
      return this.owner ?? null;
    }
    getBoundingClientRect() {
      return this.rect;
    }
  }
  class Input extends Element {
    type = "text";
    disabled = false;
    readOnly = false;
  }
  class Textarea extends Element {}
  class Select extends Element {
    disabled = false;
  }
  const owner = new Element();
  Object.assign(owner, {
    scrollTop: 0,
    scrollHeight: 900,
    clientHeight: 300,
    rect: { top: 100, bottom: 700 },
  });
  owner.owner = owner;
  const field = new Input();
  Object.assign(field, { owner, rect: { top: 500, bottom: 546 } });
  const properties = new Map();
  const attributes = new Set();
  const root = {
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key),
    },
    toggleAttribute: (key, on) => (on ? attributes.add(key) : attributes.delete(key)),
    removeAttribute: (key) => attributes.delete(key),
  };
  const document = new globalThis.EventTarget();
  Object.assign(document, { activeElement: null, documentElement: root });
  const viewport = new globalThis.EventTarget();
  Object.assign(viewport, visible);
  const window = new globalThis.EventTarget();
  Object.assign(window, {
    innerHeight: 844,
    visualViewport: viewport,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: (fn) => globalThis.setTimeout(fn, 0),
    cancelAnimationFrame: globalThis.clearTimeout,
  });
  Object.assign(globalThis, {
    window,
    document,
    Element,
    HTMLInputElement: Input,
    HTMLTextAreaElement: Textarea,
    HTMLSelectElement: Select,
  });
  let cleanup;
  try {
    cleanup = attachKeyboardViewport();
    document.activeElement = field;
    document.dispatchEvent(new globalThis.Event("focusin"));
    await wait();
    expect(properties.get("--keyboard-viewport-bottom")).toBe("384px");
    expect(owner.scrollTop).toBe(102);
    const pointer = new globalThis.Event("pointerdown");
    Object.defineProperty(pointer, "target", { value: owner });
    document.dispatchEvent(pointer);
    owner.scrollTop = 60;
    viewport.dispatchEvent(new globalThis.Event("resize"));
    await wait();
    expect(owner.scrollTop).toBe(60);
    document.activeElement = null;
    document.dispatchEvent(new globalThis.Event("focusout"));
    await wait();
    expect(properties.get("--keyboard-viewport-bottom")).toBe("0px");
    expect(attributes.has("data-keyboard-editing")).toBe(false);
    const select = new Select();
    Object.assign(select, { owner, rect: { top: 500, bottom: 552 } });
    owner.scrollTop = 0;
    document.activeElement = select;
    document.dispatchEvent(new globalThis.Event("focusin"));
    await wait();
    expect(owner.scrollTop).toBe(108);
    expect(attributes.has("data-keyboard-editing")).toBe(true);
    select.disabled = true;
    document.dispatchEvent(new globalThis.Event("focusout"));
    await wait();
    expect(attributes.has("data-keyboard-editing")).toBe(false);

    cleanup();
    expect(properties.size).toBe(0);
    viewport.dispatchEvent(new globalThis.Event("resize"));
    await wait();
    expect(properties.size).toBe(0);
  } finally {
    cleanup?.();
    Object.assign(globalThis, original);
  }
});

import { afterAll, expect, test } from "bun:test";
import { attachContentSheetDrag } from "../src/places/content-sheet-drag.ts";

const previousElement = globalThis.Element;
class Content extends globalThis.EventTarget {
  scrollTop = 0;
  interactive = false;
  captured = null;
  closest() {
    return this.interactive ? this : null;
  }
  setPointerCapture(id) {
    this.captured = id;
  }
}
globalThis.Element = Content;
afterAll(() => {
  globalThis.Element = previousElement;
});

function setup(allowUpwardFrom) {
  const content = new Content();
  const calls = [];
  const cleanup = attachContentSheetDrag(content, {
    onDrag: (delta) => calls.push(["drag", delta]),
    onRelease: (delta) => calls.push(["release", delta]),
    onCancel: () => calls.push(["cancel"]),
    allowUpwardFrom,
  });
  function pointer(type, x, y, options = {}) {
    const event = new globalThis.Event(type, { cancelable: true });
    Object.assign(
      event,
      { pointerType: "mouse", button: 0, pointerId: 1, clientX: x, clientY: y },
      options,
    );
    content.dispatchEvent(event);
    return event;
  }
  function touch(type, x, y, cancelable = true) {
    const event = new globalThis.Event(type, { cancelable });
    Object.assign(event, {
      touches: type === "touchend" ? [] : [{ identifier: 1, clientX: x, clientY: y }],
    });
    content.dispatchEvent(event);
    return event;
  }
  return { content, calls, cleanup, pointer, touch };
}

test("downward ordinary content claims only after intent and releases once", () => {
  const { calls, content, pointer, cleanup } = setup();
  pointer("pointerdown", 100, 200);
  expect(pointer("pointermove", 100, 203).defaultPrevented).toBe(false);
  expect(calls).toEqual([]);
  expect(pointer("pointermove", 100, 250).defaultPrevented).toBe(true);
  expect(content.captured).toBe(1);
  pointer("pointerup", 100, 250);
  pointer("lostpointercapture", 100, 250);
  expect(calls).toEqual([
    ["drag", 50],
    ["release", 50],
  ]);
  cleanup();
});

test("scrolled content remains native until its top, then downward movement can hand off", () => {
  const { calls, content, touch, cleanup } = setup();
  content.scrollTop = 100;
  touch("touchstart", 100, 200);
  expect(touch("touchmove", 100, 230).defaultPrevented).toBe(false);
  expect(calls).toEqual([]);
  content.scrollTop = 0;
  expect(touch("touchmove", 100, 280).defaultPrevented).toBe(true);
  touch("touchend", 100, 280);
  expect(calls).toEqual([
    ["drag", 50],
    ["release", 50],
  ]);
  cleanup();
});

test("upward and horizontal content gestures are not prevented", () => {
  const { calls, touch, cleanup } = setup();
  touch("touchstart", 100, 200);
  expect(touch("touchmove", 100, 100).defaultPrevented).toBe(false);
  touch("touchend", 100, 100);
  touch("touchstart", 100, 200);
  expect(touch("touchmove", 200, 215).defaultPrevented).toBe(false);
  touch("touchend", 200, 215);
  expect(calls).toEqual([]);
  cleanup();
});

test("an opted-in handle owns upward drags without changing ordinary content behavior", () => {
  const { calls, content, touch, cleanup } = setup(() => true);
  content.scrollTop = 100;
  touch("touchstart", 100, 200);
  expect(touch("touchmove", 100, 130).defaultPrevented).toBe(true);
  touch("touchend", 100, 130);
  expect(calls).toEqual([
    ["drag", -70],
    ["release", -70],
  ]);
  cleanup();
});

test("an opted-in handle captures pointer immediately so upward movement can leave its bounds", () => {
  const { calls, content, pointer, cleanup } = setup(() => true);
  pointer("pointerdown", 100, 200);
  expect(content.captured).toBe(1);
  pointer("pointermove", 100, 130);
  pointer("pointerup", 100, 130);
  expect(calls).toEqual([
    ["drag", -70],
    ["release", -70],
  ]);
  cleanup();
});

test("interactive content retains its touch gestures and taps", () => {
  const { calls, content, touch, pointer, cleanup } = setup();
  content.interactive = true;
  touch("touchstart", 100, 200);
  expect(touch("touchmove", 100, 300).defaultPrevented).toBe(false);
  pointer("pointerdown", 100, 200);
  pointer("pointermove", 100, 300);
  expect(calls).toEqual([]);
  cleanup();
});

test("uncancelable browser scroll never moves the sheet simultaneously", () => {
  const { calls, touch, cleanup } = setup();
  touch("touchstart", 100, 200);
  touch("touchmove", 100, 300, false);
  touch("touchmove", 100, 350);
  touch("touchend", 100, 350);
  expect(calls).toEqual([]);
  cleanup();
});

test("pointer touch events do not duplicate the native touch path", () => {
  const { calls, pointer, touch, cleanup } = setup();
  pointer("pointerdown", 100, 200, { pointerType: "touch" });
  pointer("pointermove", 100, 250, { pointerType: "touch" });
  expect(calls).toEqual([]);
  touch("touchstart", 100, 200);
  touch("touchmove", 100, 250);
  touch("touchend", 100, 250);
  expect(calls).toEqual([
    ["drag", 50],
    ["release", 50],
  ]);
  cleanup();
});

test("cancellation resets an owned drag and cleanup removes listeners", () => {
  const { calls, pointer, cleanup } = setup();
  pointer("pointerdown", 100, 200);
  pointer("pointermove", 100, 250);
  pointer("pointercancel", 100, 250);
  expect(calls).toEqual([["drag", 50], ["cancel"]]);
  cleanup();
  pointer("pointerdown", 100, 200);
  pointer("pointermove", 100, 350);
  expect(calls).toHaveLength(2);
});

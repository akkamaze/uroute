import { afterEach, expect, test } from "bun:test";

import {
  allowAnyOrientation,
  keepPortrait,
  preferPortraitOrientation,
} from "../src/orientation.ts";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalScreen = Object.getOwnPropertyDescriptor(globalThis, "screen");

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
}

afterEach(() => {
  restoreGlobal("document", originalDocument);
  restoreGlobal("screen", originalScreen);
});

function installBrowserGlobals(orientation) {
  const dataset = {};
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset } },
  });
  Object.defineProperty(globalThis, "screen", {
    configurable: true,
    value: { orientation },
  });

  return dataset;
}

test("a partial Safari orientation API never throws", () => {
  const dataset = installBrowserGlobals({ type: "portrait-primary" });

  expect(() => allowAnyOrientation()).not.toThrow();
  expect(dataset.orientationPolicy).toBe("any");
  expect(() => preferPortraitOrientation()).not.toThrow();
  expect(dataset.orientationPolicy).toBe("portrait");
});

test("orientation locks are requested when the browser supports them", async () => {
  const calls = [];
  const dataset = installBrowserGlobals({
    lock(mode) {
      calls.push(mode);

      return Promise.resolve();
    },
  });

  allowAnyOrientation();
  preferPortraitOrientation();
  await Promise.resolve();

  expect(calls).toEqual(["any", "portrait-primary"]);
  expect(dataset.orientationPolicy).toBe("portrait");
});

test("portrait lock is retried on each tap until the browser accepts it", async () => {
  const calls = [];
  let accept = false;
  const dataset = installBrowserGlobals({
    lock(mode) {
      calls.push(mode);

      return accept ? Promise.resolve() : Promise.reject(new Error("needs a gesture"));
    },
  });
  const listeners = new Map();
  const target = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  const stop = keepPortrait(target);
  await Promise.resolve();
  expect(dataset.orientationPolicy).toBe("portrait");
  accept = true;
  listeners.get("pointerup")();
  await Promise.resolve();
  await Promise.resolve();
  listeners.get("pointerup")();
  await Promise.resolve();

  expect(calls).toEqual(["portrait-primary", "portrait-primary"]);
  stop();
  expect(listeners.has("pointerup")).toBe(false);
});

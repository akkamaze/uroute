import { afterEach, expect, test } from "bun:test";

import { allowAnyOrientation, preferPortraitOrientation } from "../src/orientation.ts";

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

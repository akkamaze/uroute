import { expect, test } from "bun:test";

import { displayImportedImageUrl } from "../src/imports/import-media.ts";

test("My Maps photos load through the app's own image path outside development", () => {
  expect(import.meta.env.DEV).toBeFalsy();
  expect(
    displayImportedImageUrl(
      "https://mymaps.usercontent.google.com/hostedimage/m/*/6AXQ?authuser=0&fife=s16383",
    ),
  ).toBe("/_kml_images/m/*/6AXQ?authuser=0&fife=s16383");
});

test("photos from other hosts keep their original address", () => {
  expect(displayImportedImageUrl("https://lh3.googleusercontent.com/p/abc=w800")).toBe(
    "https://lh3.googleusercontent.com/p/abc=w800",
  );
  expect(displayImportedImageUrl("https://mymaps.usercontent.google.com/other/x.png")).toBe(
    "https://mymaps.usercontent.google.com/other/x.png",
  );
  expect(displayImportedImageUrl("/_kml_images/m/*/6AXQ")).toBe("/_kml_images/m/*/6AXQ");
  expect(displayImportedImageUrl(undefined)).toBeUndefined();
});

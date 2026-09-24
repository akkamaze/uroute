import { expect, test } from "bun:test";

import { BOOKINGS } from "../src/plan/bookings-data.ts";
import { splitBookingTimeline } from "../src/plan/booking-timeline.ts";

test("All shows one chronological timeline across booking kinds", () => {
  const result = splitBookingTimeline(BOOKINGS, "all", new Date("2026-09-24T00:00:00Z"));

  expect(result.upcoming.map((booking) => booking.id)).toEqual([
    "flight",
    "stay",
    "pass",
    "ticket",
    "train",
  ]);
  expect(result.past).toEqual([]);
});

test("a valid pass and ongoing stay remain current while completed bookings move to Past", () => {
  const result = splitBookingTimeline(BOOKINGS, "all", new Date("2026-11-15T03:00:00Z"));

  expect(result.upcoming.map((booking) => booking.id)).toEqual(["stay", "pass", "train"]);
  expect(result.past.map((booking) => booking.id)).toEqual(["ticket", "flight"]);
});

test("all-past and category filters retain the right records", () => {
  const now = new Date("2026-11-17T00:00:00Z");
  const all = splitBookingTimeline(BOOKINGS, "all", now);
  const tickets = splitBookingTimeline(BOOKINGS, "ticket", now);

  expect(all.upcoming).toEqual([]);
  expect(all.past.map((booking) => booking.id)).toEqual([
    "stay",
    "train",
    "pass",
    "ticket",
    "flight",
  ]);
  expect(tickets.past.map((booking) => booking.id)).toEqual(["ticket"]);
  expect(splitBookingTimeline([], "all", now)).toEqual({ upcoming: [], past: [] });
});

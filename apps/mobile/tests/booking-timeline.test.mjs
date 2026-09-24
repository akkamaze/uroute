import { expect, test } from "bun:test";

import { BOOKINGS } from "../src/plan/bookings-data.ts";
import {
  bookingsForTrip,
  groupBookingsByDay,
  splitBookingTimeline,
} from "../src/plan/booking-timeline.ts";
import { trips } from "../src/trips/trips-data.ts";

test("All shows one chronological timeline across booking kinds", () => {
  const result = splitBookingTimeline(BOOKINGS, "all", new Date("2026-09-24T00:00:00Z"));

  expect(result.upcoming.map((booking) => booking.id)).toEqual([
    "flight",
    "stay",
    "pass",
    "ticket",
    "train",
    "da-nang-stay",
  ]);
  expect(result.past).toEqual([]);
});

test("a valid pass and ongoing stay remain current while completed bookings move to Past", () => {
  const result = splitBookingTimeline(BOOKINGS, "all", new Date("2026-11-15T03:00:00Z"));

  expect(result.upcoming.map((booking) => booking.id)).toEqual([
    "stay",
    "pass",
    "train",
    "da-nang-stay",
  ]);
  expect(result.past.map((booking) => booking.id)).toEqual(["ticket", "flight"]);
});

test("all-past and category filters retain the right records", () => {
  const now = new Date("2026-12-09T00:00:00Z");
  const all = splitBookingTimeline(BOOKINGS, "all", now);
  const tickets = splitBookingTimeline(BOOKINGS, "tickets", now);

  expect(all.upcoming).toEqual([]);
  expect(all.past.map((booking) => booking.id)).toEqual([
    "da-nang-stay",
    "train",
    "ticket",
    "pass",
    "flight",
    "stay",
  ]);
  expect(tickets.past.map((booking) => booking.id)).toEqual(["ticket", "pass"]);
  expect(splitBookingTimeline([], "all", now)).toEqual({ upcoming: [], past: [] });
});

test("multiple bookings on one date share one timeline day row", () => {
  const { upcoming, past } = splitBookingTimeline(
    BOOKINGS,
    "all",
    new Date("2026-09-24T00:00:00Z"),
  );
  const days = groupBookingsByDay(upcoming);

  expect(days.map((day) => day.startDay)).toEqual([
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-16",
    "2026-12-04",
  ]);
  expect(days[0].bookings.map((booking) => booking.id)).toEqual(["flight", "stay"]);
  expect(groupBookingsByDay(past)).toEqual([]);
});

test("trip view reads the shared list but only shows bookings overlapping that trip", () => {
  const kyoto = trips.find((trip) => trip.id === "kyoto");
  const daNang = trips.find((trip) => trip.id === "da-nang");
  expect(kyoto).toBeDefined();
  expect(daNang).toBeDefined();
  expect(bookingsForTrip(BOOKINGS, kyoto).map((booking) => booking.id)).toEqual([
    "flight",
    "stay",
    "train",
    "pass",
    "ticket",
  ]);
  expect(bookingsForTrip(BOOKINGS, daNang).map((booking) => booking.id)).toEqual(["da-nang-stay"]);
  const outsideTrip = {
    ...BOOKINGS[0],
    id: "outside-kyoto",
    startDay: "2026-11-20",
    endExclusive: "2026-11-20T12:00:00+09:00",
  };
  expect(
    bookingsForTrip([...BOOKINGS, outsideTrip], kyoto).some(
      (booking) => booking.id === "outside-kyoto",
    ),
  ).toBe(false);
});

import type { Booking } from "./bookings-data";
import type { TripSummary } from "../trips/trips-data";

export type BookingFilter = "all" | "flight" | "stay" | "train" | "tickets";

export interface BookingTimeline {
  upcoming: Booking[];
  past: Booking[];
}

export function bookingsForTrip(bookings: readonly Booking[], trip: TripSummary): Booking[] {
  return bookings.filter(
    (booking) =>
      booking.tripId === trip.id &&
      booking.startDay <= trip.endDay &&
      (booking.startDay >= trip.startDay || booking.endExclusive.slice(0, 10) > trip.startDay),
  );
}

function compareStart(left: Booking, right: Booking): number {
  return (
    left.startDay.localeCompare(right.startDay) ||
    left.dayOrder - right.dayOrder ||
    left.id.localeCompare(right.id)
  );
}

export function splitBookingTimeline(
  bookings: readonly Booking[],
  filter: BookingFilter,
  now: Date,
): BookingTimeline {
  const upcoming: Booking[] = [];
  const past: Booking[] = [];

  for (const booking of bookings) {
    if (
      filter !== "all" &&
      (filter === "tickets" ? booking.group !== "tickets" : booking.category !== filter)
    ) {
      continue;
    }
    if (Date.parse(booking.endExclusive) <= now.getTime()) {
      past.push(booking);
    } else {
      upcoming.push(booking);
    }
  }

  upcoming.sort(compareStart);
  past.sort(
    (left, right) =>
      Date.parse(right.endExclusive) - Date.parse(left.endExclusive) || compareStart(left, right),
  );

  return { upcoming, past };
}

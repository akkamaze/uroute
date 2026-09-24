import type { Booking } from "./bookings-data";

export type BookingFilter = "all" | Booking["id"];

export interface BookingTimeline {
  upcoming: Booking[];
  past: Booking[];
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
    if (filter !== "all" && booking.id !== filter) {
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

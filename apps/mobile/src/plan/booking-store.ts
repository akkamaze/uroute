import { useSyncExternalStore } from "react";

import { BOOKINGS, type Booking } from "./bookings-data";

const STORAGE_KEY = "uroute.manual-bookings.v1";
const CATEGORIES = new Set<Booking["category"]>(["flight", "stay", "train", "pass", "ticket"]);
const GROUPS = new Set<Booking["group"]>(["travel", "tickets"]);
const KINDS = new Set<Booking["kind"]>(["Flight", "Stay", "Train", "Pass", "Ticket"]);

function isStoredBooking(value: unknown): value is Booking {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const booking = value as Partial<Booking>;

  return (
    booking.origin === "manual" &&
    typeof booking.id === "string" &&
    booking.id.startsWith("manual-") &&
    typeof booking.tripId === "string" &&
    CATEGORIES.has(booking.category as Booking["category"]) &&
    GROUPS.has(booking.group as Booking["group"]) &&
    KINDS.has(booking.kind as Booking["kind"]) &&
    typeof booking.title === "string" &&
    typeof booking.dateLabel === "string" &&
    typeof booking.timeLabel === "string" &&
    typeof booking.detail === "string" &&
    typeof booking.startDay === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(booking.startDay) &&
    typeof booking.endExclusive === "string" &&
    Number.isFinite(Date.parse(booking.endExclusive)) &&
    typeof booking.dayOrder === "number" &&
    Number.isFinite(booking.dayOrder)
  );
}

function loadManualBookings(): Booking[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter(isStoredBooking) : [];
  } catch {
    return [];
  }
}

interface BookingSnapshot {
  bookings: readonly Booking[];
  persistenceFailed: boolean;
}

let manualBookings: readonly Booking[] = loadManualBookings();
let snapshot: BookingSnapshot = {
  bookings: [...BOOKINGS, ...manualBookings],
  persistenceFailed: false,
};
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function getSnapshot(): BookingSnapshot {
  return snapshot;
}

export function useBookings(): BookingSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addManualBooking(booking: Booking): "saved" | "session-only" {
  const nextManual = [...manualBookings, booking];
  let persistenceFailed = false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextManual));
  } catch {
    persistenceFailed = true;
  }

  manualBookings = nextManual;
  snapshot = { bookings: [...BOOKINGS, ...manualBookings], persistenceFailed };
  listeners.forEach((listener) => listener());

  return persistenceFailed ? "session-only" : "saved";
}

export interface Booking {
  id: string;
  origin?: "manual";
  tripId: string;
  category: "flight" | "stay" | "train" | "pass" | "ticket";
  group: "travel" | "tickets";
  kind: "Flight" | "Stay" | "Train" | "Pass" | "Ticket";
  dateLabel: string;
  title: string;
  timeLabel: string;
  detail: string;
  // Calendar date and tie-break avoid implying a check-in or entry time that is unknown.
  startDay: string;
  dayOrder: number;
  // Date-only reservations expire at the start of the next local day.
  endExclusive: string;
  fromCode?: string;
  toCode?: string;
  fromName?: string;
  toName?: string;
  fromLocalTime?: string;
  toLocalTime?: string;
  arrivalDayOffset?: number;
  service?: string;
  airlineName?: string;
  airlineCode?: string;
  airlineLogoUrl?: string;
  coverImageUrl?: string;
}

export const BOOKINGS: readonly Booking[] = [
  {
    id: "flight",
    tripId: "kyoto",
    category: "flight",
    group: "travel",
    kind: "Flight",
    dateLabel: "12 Nov 2026",
    title: "Bangkok to Osaka",
    timeLabel: "08:30 BKK · 15:55 KIX",
    detail: "Thai Airways · TG672",
    startDay: "2026-11-12",
    dayOrder: 0,
    endExclusive: "2026-11-12T15:55:00+09:00",
    fromCode: "BKK",
    toCode: "KIX",
    fromName: "Bangkok",
    toName: "Osaka",
    fromLocalTime: "08:30",
    toLocalTime: "15:55",
    service: "TG672",
    airlineName: "Thai Airways",
    airlineCode: "TG",
  },
  {
    id: "stay",
    tripId: "kyoto",
    category: "stay",
    group: "travel",
    kind: "Stay",
    dateLabel: "12–16 Nov 2026",
    title: "The Celestine Kyoto Gion",
    timeLabel: "4 nights · 12–16 Nov",
    detail: "2 rooms · 4 guests",
    startDay: "2026-11-12",
    dayOrder: 1,
    endExclusive: "2026-11-17T00:00:00+09:00",
  },
  {
    id: "train",
    tripId: "kyoto",
    category: "train",
    group: "travel",
    kind: "Train",
    dateLabel: "16 Nov 2026",
    title: "Haruka Express",
    timeLabel: "10:15–11:35",
    detail: "Kyoto → Kansai Airport",
    startDay: "2026-11-16",
    dayOrder: 0,
    endExclusive: "2026-11-16T11:35:00+09:00",
    service: "Haruka Express",
  },
  {
    id: "pass",
    tripId: "kyoto",
    category: "pass",
    group: "tickets",
    kind: "Pass",
    dateLabel: "13–15 Nov 2026",
    title: "Kyoto sightseeing pass",
    timeLabel: "Valid 13–15 Nov",
    detail: "Digital city pass",
    startDay: "2026-11-13",
    dayOrder: 0,
    endExclusive: "2026-11-16T00:00:00+09:00",
  },
  {
    id: "ticket",
    tripId: "kyoto",
    category: "ticket",
    group: "tickets",
    kind: "Ticket",
    dateLabel: "14 Nov 2026",
    title: "Kyoto Railway Museum",
    timeLabel: "Entry · 14 Nov",
    detail: "Admission ticket",
    startDay: "2026-11-14",
    dayOrder: 0,
    endExclusive: "2026-11-15T00:00:00+09:00",
  },
  {
    id: "da-nang-stay",
    tripId: "da-nang",
    category: "stay",
    group: "travel",
    kind: "Stay",
    dateLabel: "4–7 Dec 2026",
    title: "Da Nang hotel stay",
    timeLabel: "3 nights · 4–7 Dec",
    detail: "Sample reservation",
    startDay: "2026-12-04",
    dayOrder: 0,
    endExclusive: "2026-12-08T00:00:00+07:00",
  },
];

export function isBookingId(value: unknown): value is Booking["id"] {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

export function bookingAirlineCode(booking: Booking): string | undefined {
  return (
    booking.airlineCode ??
    /^([A-Z0-9]{2})\s?\d{1,4}[A-Z]?$/i.exec(booking.service ?? "")?.[1]?.toUpperCase()
  );
}

export function bookingAirlineLogoUrl(booking: Booking): string | undefined {
  const code = bookingAirlineCode(booking);

  return (
    booking.airlineLogoUrl ??
    (code === undefined ? undefined : `https://pics.avs.io/al_square/128/128/${code}.png`)
  );
}

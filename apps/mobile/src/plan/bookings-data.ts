export interface Booking {
  id: "flight" | "stay" | "train" | "pass" | "ticket";
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
  service?: string;
}

export const BOOKINGS: readonly Booking[] = [
  {
    id: "flight",
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
    service: "TG672",
  },
  {
    id: "stay",
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
];

export function isBookingId(value: unknown): value is Booking["id"] {
  return BOOKINGS.some((booking) => booking.id === value);
}

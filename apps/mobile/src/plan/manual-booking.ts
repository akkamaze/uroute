import type { Booking } from "./bookings-data";

export type ManualBookingCategory = "flight" | "stay" | "train" | "tickets";

export interface ManualBookingDraft {
  category: ManualBookingCategory;
  ticketKind: "ticket" | "pass";
  tripId: string;
  title: string;
  startDay: string;
  endDay: string;
  startTime: string;
  endTime: string;
  fromName: string;
  fromCode: string;
  toName: string;
  toCode: string;
  airlineName: string;
  service: string;
  detail: string;
}

export type ManualBookingResult =
  | { booking: Booking; error?: never; field?: never }
  | { booking?: never; error: string; field: keyof ManualBookingDraft };

export function emptyManualBooking(tripId = "", startDay = "", endDay = ""): ManualBookingDraft {
  return {
    category: "flight",
    ticketKind: "ticket",
    tripId,
    title: "",
    startDay,
    endDay: endDay || startDay,
    startTime: "",
    endTime: "",
    fromName: "",
    fromCode: "",
    toName: "",
    toCode: "",
    airlineName: "",
    service: "",
    detail: "",
  };
}

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }
  const parsed = new Date(`${day}T00:00:00Z`);

  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function validTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function formatRange(startDay: string, endDay: string): string {
  if (startDay === endDay) {
    return formatDay(startDay);
  }
  const start = new Date(`${startDay}T12:00:00Z`);
  const end = new Date(`${endDay}T12:00:00Z`);
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
    if (start.getUTCMonth() === end.getUTCMonth()) {
      return `${start.getUTCDate()}–${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`;
    }

    return `${start.getUTCDate()} ${month.format(start)} – ${end.getUTCDate()} ${month.format(end)} ${end.getUTCFullYear()}`;
  }

  return `${formatDay(startDay)} – ${formatDay(endDay)}`;
}

function missing(field: keyof ManualBookingDraft, label: string): ManualBookingResult {
  return { field, error: `Add ${label}.` };
}

export function validateManualBookingDates(
  draft: ManualBookingDraft,
): { field: keyof ManualBookingDraft; error: string } | null {
  if (!draft.tripId) {
    return { field: "tripId", error: "Choose a trip." };
  }
  if (!validDay(draft.startDay)) {
    return { field: "startDay", error: "Choose a valid start date." };
  }
  const endDay =
    draft.category === "tickets" && draft.ticketKind === "ticket"
      ? draft.startDay
      : draft.endDay || draft.startDay;
  if (!validDay(endDay)) {
    return { field: "endDay", error: "Choose a valid end date." };
  }
  if (endDay < draft.startDay || (draft.category === "stay" && endDay === draft.startDay)) {
    return {
      field: "endDay",
      error:
        draft.category === "stay"
          ? "Check-out must be after check-in."
          : "End date must be on or after start date.",
    };
  }

  return null;
}

export function buildManualBooking(draft: ManualBookingDraft, id: string): ManualBookingResult {
  const title = draft.title.trim();
  const fromName = draft.fromName.trim();
  const toName = draft.toName.trim();
  const fromCode = draft.fromCode.trim().toUpperCase();
  const toCode = draft.toCode.trim().toUpperCase();
  const service = draft.service.trim();
  const airlineName = draft.airlineName.trim();
  const detail = draft.detail.trim();

  const dateError = validateManualBookingDates(draft);
  if (dateError !== null) {
    return dateError;
  }
  if (draft.category === "flight") {
    if (!fromName) {
      return missing("fromName", "the departure city");
    }
    if (!/^[A-Z]{3}$/.test(fromCode)) {
      return { field: "fromCode", error: "Use a 3-letter departure airport code." };
    }
    if (!toName) {
      return missing("toName", "the arrival city");
    }
    if (!/^[A-Z]{3}$/.test(toCode)) {
      return { field: "toCode", error: "Use a 3-letter arrival airport code." };
    }
  } else if (!title) {
    return missing("title", draft.category === "stay" ? "the property name" : "a name");
  }
  if (draft.category === "train") {
    if (!fromName) {
      return missing("fromName", "the departure station");
    }
    if (!toName) {
      return missing("toName", "the arrival station");
    }
  }
  const endDay =
    draft.category === "tickets" && draft.ticketKind === "ticket"
      ? draft.startDay
      : draft.endDay || draft.startDay;
  if (draft.category === "flight" || draft.category === "train") {
    if (!validTime(draft.startTime)) {
      return { field: "startTime", error: "Add a valid departure time." };
    }
    if (!validTime(draft.endTime)) {
      return { field: "endTime", error: "Add a valid arrival time." };
    }
  }
  if (draft.category === "tickets" && draft.startTime && !validTime(draft.startTime)) {
    return { field: "startTime", error: "Use a valid entry time." };
  }

  const category: Booking["category"] =
    draft.category === "tickets" ? draft.ticketKind : draft.category;
  const kind =
    category === "flight"
      ? "Flight"
      : category === "stay"
        ? "Stay"
        : category === "train"
          ? "Train"
          : category === "pass"
            ? "Pass"
            : "Ticket";
  const nights = Math.round(
    (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${draft.startDay}T00:00:00Z`)) / 86_400_000,
  );
  const dateLabel = formatRange(draft.startDay, endDay);
  const timeLabel =
    category === "flight"
      ? `${draft.startTime} ${fromCode} · ${draft.endTime} ${toCode}`
      : category === "stay"
        ? `${nights} ${nights === 1 ? "night" : "nights"} · ${dateLabel}`
        : category === "train"
          ? `${draft.startTime}–${draft.endTime}`
          : category === "pass"
            ? `Valid ${dateLabel}`
            : draft.startTime
              ? `Entry ${draft.startTime} · ${formatDay(draft.startDay)}`
              : `Entry · ${formatDay(draft.startDay)}`;
  const booking: Booking = {
    id,
    origin: "manual",
    tripId: draft.tripId,
    category,
    group: category === "ticket" || category === "pass" ? "tickets" : "travel",
    kind,
    dateLabel,
    title: category === "flight" ? `${fromName} to ${toName}` : title,
    timeLabel,
    detail:
      detail ||
      (category === "flight"
        ? [airlineName, service].filter(Boolean).join(" · ") || "Flight booking"
        : category === "train"
          ? `${fromName} → ${toName}`
          : category === "stay"
            ? "Stay reservation"
            : category === "pass"
              ? "Digital pass"
              : "Admission ticket"),
    startDay: draft.startDay,
    dayOrder: 0,
    // Manual entries do not claim a live timezone-aware flight status. They expire by calendar day.
    endExclusive: `${nextDay(endDay)}T00:00:00`,
    ...(category === "flight"
      ? {
          fromName,
          fromCode,
          toName,
          toCode,
          fromLocalTime: draft.startTime,
          toLocalTime: draft.endTime,
          ...(airlineName ? { airlineName } : {}),
          ...(service ? { service } : {}),
        }
      : category === "train"
        ? { service: title }
        : {}),
  };

  return { booking };
}

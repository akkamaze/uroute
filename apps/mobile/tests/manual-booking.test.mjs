import { expect, test } from "bun:test";

import { buildManualBooking, emptyManualBooking } from "../src/plan/manual-booking.ts";

test("manual flight keeps local times and uses a date-only expiry", () => {
  const draft = {
    ...emptyManualBooking("kyoto", "2026-11-12"),
    fromName: "Bangkok",
    fromCode: "bkk",
    toName: "Osaka",
    toCode: "kix",
    startTime: "08:30",
    endTime: "15:55",
    airlineName: "Thai Airways",
    service: "TG672",
  };

  const result = buildManualBooking(draft, "manual-flight-1");
  expect(result.error).toBeUndefined();
  expect(result.booking).toMatchObject({
    id: "manual-flight-1",
    origin: "manual",
    category: "flight",
    fromCode: "BKK",
    toCode: "KIX",
    fromLocalTime: "08:30",
    toLocalTime: "15:55",
    endExclusive: "2026-11-13T00:00:00",
  });
});

test("stay requires checkout after checkin", () => {
  const draft = {
    ...emptyManualBooking("kyoto", "2026-11-12"),
    category: "stay",
    title: "Hotel Gion",
  };
  expect(buildManualBooking(draft, "manual-stay-1")).toMatchObject({
    field: "endDay",
    error: "Check-out must be after check-in.",
  });

  const valid = buildManualBooking({ ...draft, endDay: "2026-11-16" }, "manual-stay-1");
  expect(valid.booking).toMatchObject({
    category: "stay",
    timeLabel: "4 nights · 12–16 Nov 2026",
    endExclusive: "2026-11-17T00:00:00",
  });
});

test("Tickets contains both ticket and pass, without leaking hidden end dates", () => {
  const base = {
    ...emptyManualBooking("kyoto", "2026-11-14", "2026-11-16"),
    category: "tickets",
    title: "Museum entry",
  };
  const ticket = buildManualBooking(base, "manual-ticket-1");
  expect(ticket.booking).toMatchObject({
    category: "ticket",
    group: "tickets",
    endExclusive: "2026-11-15T00:00:00",
  });
  const pass = buildManualBooking(
    { ...base, ticketKind: "pass", title: "City pass" },
    "manual-pass-1",
  );
  expect(pass.booking).toMatchObject({
    category: "pass",
    group: "tickets",
    endExclusive: "2026-11-17T00:00:00",
  });
});

test("flight rejects incomplete airport codes", () => {
  const draft = {
    ...emptyManualBooking("kyoto", "2026-11-12"),
    fromName: "Bangkok",
    fromCode: "BK",
    toName: "Osaka",
    toCode: "KIX",
    startTime: "08:30",
    endTime: "15:55",
  };
  expect(buildManualBooking(draft, "manual-flight-2")).toMatchObject({ field: "fromCode" });
});

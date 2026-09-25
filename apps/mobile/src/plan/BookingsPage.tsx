import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Compass,
  Hotel,
  Plane,
  Plus,
  Share,
  Ticket,
  TrainFront,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppMode } from "../app-mode";
import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { trips, type TripSummary } from "../trips/trips-data";
import { type CreatedTrip } from "../trips/trip-store";
import { useRealTrips } from "../trips/use-real-trips";
import { AddBookingDialog } from "./AddBookingDialog";
import { addManualBooking, useBookings } from "./booking-store";
import {
  bookingsForTrip,
  groupBookingsByDay,
  splitBookingTimeline,
  type BookingFilter,
} from "./booking-timeline";
import { bookingAirlineCode, bookingAirlineLogoUrl, type Booking } from "./bookings-data";
import { shareBookingCard } from "./share-booking-card";
import { TripHeader } from "./TripHeader";
import "./bookings.css";

const BOOKING_ICONS = {
  flight: Plane,
  stay: Hotel,
  train: TrainFront,
  pass: Compass,
  ticket: Ticket,
} as const;

const FILTERS: readonly { id: BookingFilter; label: string; emptyLabel: string }[] = [
  { id: "all", label: "All", emptyLabel: "bookings" },
  { id: "flight", label: "Flights", emptyLabel: "flights" },
  { id: "stay", label: "Stays", emptyLabel: "stays" },
  { id: "train", label: "Trains", emptyLabel: "trains" },
  { id: "tickets", label: "Tickets", emptyLabel: "tickets" },
];

const PLAN_TRIP = trips[0];

function createdTripSummary(trip: CreatedTrip): TripSummary {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = new Date(`${trip.startDate}T12:00:00Z`);
  const end = new Date(`${trip.endDate}T12:00:00Z`);
  const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return {
    id: trip.id,
    name: trip.name,
    startDay: trip.startDate,
    endDay: trip.endDate,
    dateLabel: `${formatter.format(start)}–${formatter.format(end)}`,
    durationLabel: `${duration} ${duration === 1 ? "day" : "days"}`,
    featured: false,
    imageAlt: "",
    imageSrc: "",
    period: trip.endDate < new Date().toISOString().slice(0, 10) ? "past" : "upcoming",
  };
}

interface BookingItemsProps {
  bookings: readonly Booking[];
  onOpen: (booking: Booking, trigger: HTMLButtonElement) => void;
}

function BookingItems({ bookings, onOpen }: BookingItemsProps): React.JSX.Element {
  return (
    <ol className="booking-timeline">
      {groupBookingsByDay(bookings).map((day) => {
        const firstBooking = day.bookings[0];
        const leadingFlight = firstBooking?.category === "flight" ? firstBooking : undefined;
        const dateLabel = new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${day.startDay}T12:00:00Z`));

        return (
          <li
            className={`booking-timeline__day${leadingFlight ? " booking-timeline__day--journey" : ""}`}
            key={day.startDay}
          >
            {leadingFlight ? (
              <div className="booking-timeline__journey-heading">
                <span aria-hidden="true" className="booking-timeline__marker" />
                <h4>
                  {leadingFlight.fromName} to {leadingFlight.toName}
                </h4>
              </div>
            ) : null}
            <div className="booking-timeline__day-heading">
              <span aria-hidden="true" className="booking-timeline__marker" />
              <time dateTime={day.startDay}>
                <CalendarDays aria-hidden="true" size={16} strokeWidth={1.8} />
                {dateLabel}
              </time>
            </div>
            <ol className="booking-timeline__day-items">
              {day.bookings.map((booking) => {
                const Icon = BOOKING_ICONS[booking.category];
                const isFlight = booking.category === "flight";

                return (
                  <li className="booking-timeline__entry" key={booking.id}>
                    {isFlight && booking !== leadingFlight ? (
                      <h4 className="booking-timeline__journey">
                        {booking.fromName} to {booking.toName}
                      </h4>
                    ) : null}
                    <button
                      className={`booking-timeline__card booking-timeline__card--${booking.category}`}
                      id={`booking-card-${booking.id}`}
                      onClick={(event) => onOpen(booking, event.currentTarget)}
                      type="button"
                    >
                      {isFlight ? (
                        <>
                          <span className="booking-timeline__topline">
                            <span className="booking-timeline__kind">
                              <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
                              {booking.kind}
                            </span>
                            <span>{booking.service}</span>
                          </span>
                          <span className="booking-timeline__route">
                            <span className="booking-timeline__airport">
                              <strong>{booking.fromCode}</strong>
                              <span>{booking.fromName}</span>
                              <b>{booking.fromLocalTime}</b>
                              <small>Local time</small>
                            </span>
                            <span aria-hidden="true" className="booking-timeline__route-arrow">
                              →
                            </span>
                            <span className="booking-timeline__airport booking-timeline__airport--arrival">
                              <strong>{booking.toCode}</strong>
                              <span>{booking.toName}</span>
                              <b>
                                {booking.toLocalTime}
                                {booking.arrivalDayOffset ? (
                                  <sup
                                    aria-label={`${booking.arrivalDayOffset} day later`}
                                    className="booking-timeline__day-offset"
                                  >
                                    +{booking.arrivalDayOffset}
                                  </sup>
                                ) : null}
                              </b>
                              <small>Local time</small>
                            </span>
                          </span>
                          <span className="booking-timeline__airline">
                            <span aria-hidden="true" className="booking-timeline__airline-mark">
                              {bookingAirlineCode(booking) ?? <Plane size={17} strokeWidth={1.9} />}
                              {bookingAirlineLogoUrl(booking) !== undefined ? (
                                <img
                                  alt=""
                                  crossOrigin="anonymous"
                                  key={bookingAirlineLogoUrl(booking)}
                                  onError={(event) => {
                                    event.currentTarget.hidden = true;
                                  }}
                                  src={bookingAirlineLogoUrl(booking)}
                                />
                              ) : null}
                            </span>
                            <span>{booking.airlineName ?? booking.detail}</span>
                            <span className="booking-timeline__view">
                              View <ChevronRight aria-hidden="true" size={17} />
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="booking-timeline__topline">
                            <span className="booking-timeline__kind">
                              <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
                              {booking.kind}
                            </span>
                            <span>{booking.dateLabel}</span>
                          </span>
                          <span className="booking-timeline__secondary">
                            <span aria-hidden="true" className="booking-timeline__art">
                              <Icon size={25} strokeWidth={1.5} />
                              {booking.coverImageUrl !== undefined ? (
                                <img
                                  alt=""
                                  onError={(event) => {
                                    event.currentTarget.hidden = true;
                                  }}
                                  src={booking.coverImageUrl}
                                />
                              ) : null}
                            </span>
                            <span className="booking-timeline__secondary-copy">
                              <strong>{booking.title}</strong>
                              <span>{booking.timeLabel}</span>
                              <small>{booking.detail}</small>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className="booking-timeline__secondary-arrow"
                              size={18}
                            />
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

function BookingScreen({
  scope,
  createdTrip,
}: {
  scope: "all" | "trip";
  createdTrip?: CreatedTrip;
}): React.JSX.Element {
  const mode = useAppMode();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const bookingState = useBookings();
  const route = scope === "all" ? "/bookings" : "/plan/bookings";
  const activeTrip = createdTrip ? createdTripSummary(createdTrip) : PLAN_TRIP;
  const realTrips = useRealTrips();
  const realTripIds = new Set(realTrips.trips.map((trip) => trip.id));
  const scopedBookings =
    scope === "all"
      ? bookingState.bookings.filter((booking) =>
          mode === "mock"
            ? trips.some((trip) => trip.id === booking.tripId)
            : booking.origin === "manual" && realTripIds.has(booking.tripId),
        )
      : bookingsForTrip(bookingState.bookings, activeTrip);
  const selectedBooking = scopedBookings.find((booking) => booking.id === search.booking);
  const addOpen = search.add === "open";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addOpenedHereRef = useRef(false);
  const addWasOpenRef = useRef(false);
  const pendingRevealRef = useRef<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement>(null);
  const openedHereRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [pastPreference, setPastPreference] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const { upcoming, past } = splitBookingTimeline(scopedBookings, filter, now);
  const pastOpen = pastPreference ?? upcoming.length === 0;
  const emptyLabel = FILTERS.find((option) => option.id === filter)?.emptyLabel ?? "bookings";

  function navigateBooking(search: { add?: "open"; booking?: string }, replace = false): void {
    if (createdTrip) {
      void navigate({
        to: "/plan/trip/$tripId/bookings",
        params: { tripId: createdTrip.id },
        search,
        replace,
        resetScroll: false,
      });
    } else {
      void navigate({ to: route, search, replace, resetScroll: false });
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    function refreshOnReturn(): void {
      if (document.visibilityState === "visible") {
        setNow(new Date());
      }
    }

    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (selectedBooking !== undefined && !dialog.open) {
      wasOpenRef.current = true;
      dialog.showModal();
      closeButtonRef.current?.focus({ preventScroll: true });
    } else if (selectedBooking === undefined && wasOpenRef.current) {
      dialog.close();
      lastTriggerRef.current?.focus({ preventScroll: true });
      wasOpenRef.current = false;
      openedHereRef.current = false;
      setShareMessage("");
    }
  }, [selectedBooking]);

  useEffect(() => {
    if (addOpen) {
      addWasOpenRef.current = true;
    } else if (addWasOpenRef.current) {
      addButtonRef.current?.focus({ preventScroll: true });
      addWasOpenRef.current = false;
      addOpenedHereRef.current = false;
    }
  }, [addOpen]);

  useEffect(() => {
    const id = pendingRevealRef.current;
    if (id === null || addOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`booking-card-${id}`);
      if (card !== null) {
        card.scrollIntoView({ block: "center", behavior: "smooth" });
        pendingRevealRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [addOpen, bookingState.bookings, filter, pastPreference]);

  function selectFilter(next: BookingFilter): void {
    setFilter(next);
    setPastPreference(null);
  }

  function openAdd(): void {
    addOpenedHereRef.current = true;
    setSaveMessage("");
    navigateBooking({ add: "open" });
  }

  function closeAdd(): void {
    if (addOpenedHereRef.current) {
      window.history.back();
    } else {
      navigateBooking({}, true);
    }
  }

  function addBooking(booking: Booking): void {
    const saveResult = addManualBooking(booking);
    const inScope = scope === "all" || bookingsForTrip([booking], activeTrip).length > 0;
    const visibleInFilter =
      filter === "all" ||
      (filter === "tickets" ? booking.group === "tickets" : booking.category === filter);
    if (!visibleInFilter) {
      setFilter("all");
    }
    if (Date.parse(booking.endExclusive) <= now.getTime()) {
      setPastPreference(true);
    }
    if (inScope) {
      pendingRevealRef.current = booking.id;
    }
    setSaveMessage(
      saveResult === "session-only"
        ? "Booking added for this session. Device storage is unavailable."
        : inScope
          ? "Booking added."
          : "Booking added to All bookings. Its date is outside this trip.",
    );
    closeAdd();
  }

  function openBooking(booking: Booking, trigger: HTMLButtonElement): void {
    lastTriggerRef.current = trigger;
    openedHereRef.current = true;
    setShareMessage("");
    navigateBooking({ booking: booking.id });
  }

  function closeBooking(): void {
    if (!beginDialogDismissal(dialogRef.current)) {
      return;
    }
    if (openedHereRef.current) {
      window.history.back();
    } else {
      navigateBooking({}, true);
    }
  }

  async function shareSelectedBooking(): Promise<void> {
    const ticket = ticketRef.current;
    if (selectedBooking === undefined || sharing || ticket === null) {
      return;
    }
    setSharing(true);
    setShareMessage("");
    try {
      const result = await shareBookingCard(selectedBooking, ticket);
      if (result === "downloaded") {
        setShareMessage("Image saved. You can post it from your photos or files.");
      }
    } catch {
      setShareMessage("Could not create the image. Please try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className={`booking-page booking-page--${scope}`}>
      {scope === "trip" ? (
        <TripHeader active="bookings" trip={createdTrip} />
      ) : (
        <header className="booking-page__header">
          <Link aria-label="Back to trips" className="booking-page__back" to="/trips">
            <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
          </Link>
          <h1>Bookings</h1>
          <span aria-hidden="true" className="booking-page__header-spacer" />
        </header>
      )}

      <main className="booking-page__content">
        <nav aria-label="Booking categories" className="booking-filters">
          {FILTERS.map((option) => (
            <button
              aria-pressed={filter === option.id}
              className={
                filter === option.id
                  ? "booking-filters__chip booking-filters__chip--active"
                  : "booking-filters__chip"
              }
              key={option.id}
              onClick={() => selectFilter(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </nav>

        {saveMessage ? (
          <p className="booking-page__save-message" role="status">
            {saveMessage}
          </p>
        ) : null}

        {past.length > 0 ? (
          <section aria-label="Past bookings" className="booking-past">
            <button
              aria-expanded={pastOpen}
              className="booking-past__toggle"
              onClick={() => setPastPreference(!pastOpen)}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={
                  pastOpen
                    ? "booking-past__chevron booking-past__chevron--open"
                    : "booking-past__chevron"
                }
                size={18}
              />
              <span>Past</span>
              <span className="booking-past__count">{past.length}</span>
            </button>
            {pastOpen ? <BookingItems bookings={past} onOpen={openBooking} /> : null}
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-label="Upcoming bookings" className="booking-upcoming">
            <div className="booking-upcoming__heading">
              <h3>Upcoming</h3>
              <span>
                {upcoming.length} {upcoming.length === 1 ? "booking" : "bookings"}
              </span>
            </div>
            <BookingItems bookings={upcoming} onOpen={openBooking} />
          </section>
        ) : past.length > 0 ? (
          !pastOpen ? (
            <p className="booking-page__empty">No upcoming bookings.</p>
          ) : null
        ) : (
          <div className="booking-page__empty">
            <p>No {emptyLabel} yet.</p>
            {filter === "all" ? (
              <span>Your reservations, tickets, and passes will appear here.</span>
            ) : (
              <button onClick={() => selectFilter("all")} type="button">
                View all bookings
              </button>
            )}
          </div>
        )}
      </main>

      <button
        aria-label="Add booking"
        className="floating-add-button"
        onClick={openAdd}
        ref={addButtonRef}
        type="button"
      >
        <Plus aria-hidden="true" size={28} strokeWidth={1.9} />
      </button>

      <dialog
        aria-label={selectedBooking === undefined ? "Booking card" : selectedBooking.title}
        className={`booking-dialog booking-dialog--${selectedBooking?.category ?? "flight"}`}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeBooking();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeBooking();
          }
        }}
        ref={dialogRef}
      >
        {selectedBooking !== undefined ? (
          <div className="booking-dialog__layout">
            <div className="booking-dialog__topbar">
              <button
                aria-label="Close booking card"
                className="booking-dialog__close"
                onClick={closeBooking}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={22} strokeWidth={1.8} />
              </button>
              <p className="booking-dialog__caption">Share your journey</p>
            </div>
            <article aria-label="Share preview" className="booking-ticket" ref={ticketRef}>
              <header className="booking-ticket__header">
                <span className="booking-ticket__brand">
                  <span>u</span>route
                </span>
                <span className="booking-ticket__tagline">Journeys worth remembering</span>
              </header>
              {selectedBooking.fromCode === undefined ? (
                <div className="booking-ticket__primary booking-ticket__primary--feature">
                  <span className="booking-ticket__overline">
                    {selectedBooking.category === "stay"
                      ? "YOUR STAY"
                      : selectedBooking.category === "train"
                        ? "YOUR TRAIN"
                        : "TICKETS"}
                  </span>
                  <h2>{selectedBooking.title}</h2>
                  <p>{selectedBooking.timeLabel}</p>
                </div>
              ) : (
                <div className="booking-ticket__primary">
                  <span className="booking-ticket__overline">
                    {selectedBooking.category === "flight"
                      ? `FLIGHT TO ${selectedBooking.toName?.toUpperCase() ?? "YOUR DESTINATION"}`
                      : "YOUR TRAIN"}
                  </span>
                  <div className="booking-ticket__route">
                    <div>
                      <strong>{selectedBooking.fromCode}</strong>
                      <span>{selectedBooking.fromName}</span>
                      {selectedBooking.fromLocalTime !== undefined ? (
                        <time className="booking-ticket__local-time">
                          {selectedBooking.fromLocalTime}
                          <small>Local time</small>
                        </time>
                      ) : null}
                    </div>
                    <span aria-hidden="true" className="booking-ticket__route-line">
                      <span className="booking-ticket__route-dash" />
                      {selectedBooking.category === "flight" ? (
                        <Plane size={19} />
                      ) : (
                        <TrainFront size={19} />
                      )}
                      <span className="booking-ticket__route-dash" />
                    </span>
                    <div>
                      <strong>{selectedBooking.toCode}</strong>
                      <span>{selectedBooking.toName}</span>
                      {selectedBooking.toLocalTime !== undefined ? (
                        <time className="booking-ticket__local-time">
                          <span className="booking-ticket__clock">
                            {selectedBooking.toLocalTime}
                            {selectedBooking.arrivalDayOffset ? (
                              <sup
                                aria-label={`${selectedBooking.arrivalDayOffset} day later`}
                                className="booking-ticket__day-offset"
                              >
                                +{selectedBooking.arrivalDayOffset}
                              </sup>
                            ) : null}
                          </span>
                          <small>Local time</small>
                        </time>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
              <div className="booking-ticket__details">
                <div>
                  <span>DATE</span>
                  <strong>{selectedBooking.dateLabel}</strong>
                </div>
                {selectedBooking.category === "flight" ? (
                  <div className="booking-ticket__operator">
                    <span aria-hidden="true" className="booking-ticket__operator-mark">
                      {bookingAirlineCode(selectedBooking) ?? <Plane size={17} strokeWidth={1.8} />}
                      {bookingAirlineLogoUrl(selectedBooking) !== undefined ? (
                        <img
                          alt=""
                          crossOrigin="anonymous"
                          key={bookingAirlineLogoUrl(selectedBooking)}
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                          src={bookingAirlineLogoUrl(selectedBooking)}
                        />
                      ) : null}
                    </span>
                    <span className="booking-ticket__operator-name">
                      <strong>{selectedBooking.airlineName ?? selectedBooking.kind}</strong>
                      <small>{selectedBooking.service}</small>
                    </span>
                  </div>
                ) : selectedBooking.fromCode === undefined ? (
                  <div>
                    <span>DETAILS</span>
                    <strong>{selectedBooking.detail}</strong>
                  </div>
                ) : (
                  <div>
                    <span>SERVICE</span>
                    <strong>{selectedBooking.service ?? selectedBooking.kind}</strong>
                  </div>
                )}
                {selectedBooking.fromCode === undefined ? (
                  <div>
                    <span>TYPE</span>
                    <strong>{selectedBooking.service ?? selectedBooking.kind}</strong>
                  </div>
                ) : null}
              </div>
              <div aria-hidden="true" className="booking-ticket__perforation" />
              <footer className="booking-ticket__footer">
                <div>
                  <strong>Have a great trip!</strong>
                </div>
                <svg
                  aria-hidden="true"
                  width="27"
                  height="27"
                  viewBox="0 0 32 32"
                  fill="currentColor"
                >
                  <path d="M28 14.4c2.8 0 2.8 3.2 0 3.2h-8.5l-6.1 12-2.8-.7 3.2-11.3H7l-3.5 4H1l2.2-5.6L1 10.4h2.5l3.5 4h6.8L10.6 3.1l2.8-.7 6.1 12Z" />
                </svg>
              </footer>
              <div aria-hidden="true" className="booking-ticket__landscape" />
            </article>
            <button
              className="booking-dialog__share"
              disabled={sharing}
              onClick={() => void shareSelectedBooking()}
              type="button"
            >
              <Share aria-hidden="true" size={19} strokeWidth={1.8} />
              {sharing ? "Preparing image…" : "Share booking"}
            </button>
            {shareMessage.length > 0 ? (
              <p className="booking-dialog__message" role="status">
                {shareMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </dialog>
      <AddBookingDialog
        onAdded={addBooking}
        onClose={closeAdd}
        open={addOpen}
        trip={scope === "trip" ? activeTrip : undefined}
      />
    </section>
  );
}

export function BookingsPage(): React.JSX.Element {
  return <BookingScreen scope="all" />;
}

export function TripBookingsPage(): React.JSX.Element {
  return <BookingScreen scope="trip" />;
}

export function CreatedTripBookingsPage(): React.JSX.Element {
  const { tripId } = useParams({ from: "/mobile-shell/plan/trip/$tripId/bookings" });
  const realTrips = useRealTrips();
  const trip = realTrips.trips.find((item) => item.id === tripId);

  return trip ? (
    <BookingScreen createdTrip={trip} scope="trip" />
  ) : realTrips.loading ? (
    <section role="status">Loading trip…</section>
  ) : (
    <section>Trip not found.</section>
  );
}

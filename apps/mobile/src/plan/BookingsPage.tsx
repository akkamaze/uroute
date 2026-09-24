import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Compass,
  Hotel,
  Plane,
  Share2,
  Ticket,
  TrainFront,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { splitBookingTimeline, type BookingFilter } from "./booking-timeline";
import { BOOKINGS, type Booking } from "./bookings-data";
import { shareBookingCard } from "./share-booking-card";
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
  { id: "ticket", label: "Tickets", emptyLabel: "tickets" },
  { id: "pass", label: "Passes", emptyLabel: "passes" },
];

interface BookingItemsProps {
  bookings: readonly Booking[];
  onOpen: (booking: Booking, trigger: HTMLButtonElement) => void;
}

function BookingItems({ bookings, onOpen }: BookingItemsProps): React.JSX.Element {
  return (
    <ol className="booking-timeline">
      {bookings.map((booking) => {
        const Icon = BOOKING_ICONS[booking.id];

        return (
          <li className="booking-timeline__item" key={booking.id}>
            <span aria-hidden="true" className="booking-timeline__marker">
              <Icon size={19} strokeWidth={1.8} />
            </span>
            <button
              className="booking-timeline__card"
              onClick={(event) => onOpen(booking, event.currentTarget)}
              type="button"
            >
              <span className="booking-timeline__meta">
                {booking.kind} · {booking.dateLabel}
              </span>
              <strong>{booking.title}</strong>
              <span className="booking-timeline__time">{booking.timeLabel}</span>
              <span className="booking-timeline__detail">{booking.detail}</span>
              <ChevronRight aria-hidden="true" className="booking-timeline__chevron" size={18} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function BookingsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/bookings" });
  const selectedBooking = BOOKINGS.find((booking) => booking.id === search.booking);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement>(null);
  const openedHereRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [pastPreference, setPastPreference] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const { upcoming, past } = splitBookingTimeline(BOOKINGS, filter, now);
  const pastOpen = pastPreference ?? upcoming.length === 0;
  const emptyLabel = FILTERS.find((option) => option.id === filter)?.emptyLabel ?? "bookings";

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

  function selectFilter(next: BookingFilter): void {
    setFilter(next);
    setPastPreference(null);
  }

  function openBooking(booking: Booking, trigger: HTMLButtonElement): void {
    lastTriggerRef.current = trigger;
    openedHereRef.current = true;
    setShareMessage("");
    void navigate({ to: "/bookings", search: { booking: booking.id }, resetScroll: false });
  }

  function closeBooking(): void {
    if (!beginDialogDismissal(dialogRef.current)) {
      return;
    }
    if (openedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ to: "/bookings", search: {}, replace: true, resetScroll: false });
    }
  }

  async function shareSelectedBooking(): Promise<void> {
    if (selectedBooking === undefined || sharing) {
      return;
    }
    setSharing(true);
    setShareMessage("");
    try {
      const result = await shareBookingCard(selectedBooking);
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
    <section className="booking-page">
      <header className="booking-page__header">
        <Link aria-label="Back to trips" className="booking-page__back" to="/trips">
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
        </Link>
        <h1>Bookings</h1>
        <span aria-hidden="true" className="booking-page__header-spacer" />
      </header>

      <main className="booking-page__content">
        <div className="booking-page__intro">
          <p className="booking-page__eyebrow">KYOTO · 12–16 NOV</p>
          <h2>Travel details</h2>
          <p>Your reservations, tickets, and passes in one place.</p>
          <span className="booking-page__sample">Sample bookings</span>
        </div>

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
          <BookingItems bookings={upcoming} onOpen={openBooking} />
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

      <dialog
        aria-label={selectedBooking === undefined ? "Booking card" : selectedBooking.title}
        className={`booking-dialog booking-dialog--${selectedBooking?.id ?? "flight"}`}
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
            <button
              aria-label="Close booking card"
              className="booking-dialog__close"
              onClick={closeBooking}
              ref={closeButtonRef}
              type="button"
            >
              <X aria-hidden="true" size={22} strokeWidth={1.8} />
            </button>
            <article aria-label="Share preview" className="booking-ticket">
              <header className="booking-ticket__header">
                <span className="booking-ticket__brand">
                  uroute<span>.</span>
                </span>
                <span>{selectedBooking.kind} summary</span>
              </header>
              {selectedBooking.fromCode === undefined ? (
                <div className="booking-ticket__primary booking-ticket__primary--feature">
                  <span className="booking-ticket__overline">
                    {selectedBooking.id === "stay"
                      ? "YOUR STAY IN KYOTO"
                      : selectedBooking.id === "train"
                        ? "TRAIN TO THE AIRPORT"
                        : "TICKETS & PASSES"}
                  </span>
                  <h2>{selectedBooking.title}</h2>
                  <p>{selectedBooking.timeLabel}</p>
                </div>
              ) : (
                <div className="booking-ticket__primary">
                  <span className="booking-ticket__overline">
                    {selectedBooking.id === "flight" ? "FLIGHT TO OSAKA" : "TRAIN TO THE AIRPORT"}
                  </span>
                  <div className="booking-ticket__route">
                    <div>
                      <strong>{selectedBooking.fromCode}</strong>
                      <span>{selectedBooking.fromName}</span>
                    </div>
                    <span aria-hidden="true" className="booking-ticket__route-line">
                      {selectedBooking.id === "flight" ? (
                        <Plane size={19} />
                      ) : (
                        <TrainFront size={19} />
                      )}
                    </span>
                    <div>
                      <strong>{selectedBooking.toCode}</strong>
                      <span>{selectedBooking.toName}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="booking-ticket__details">
                <div>
                  <span>DATE</span>
                  <strong>{selectedBooking.dateLabel}</strong>
                </div>
                <div>
                  <span>{selectedBooking.fromCode === undefined ? "DETAILS" : "LOCAL TIMES"}</span>
                  <strong>
                    {selectedBooking.fromCode === undefined
                      ? selectedBooking.detail
                      : selectedBooking.timeLabel}
                  </strong>
                </div>
                <div>
                  <span>
                    {selectedBooking.id === "flight"
                      ? "FLIGHT"
                      : selectedBooking.id === "train"
                        ? "SERVICE"
                        : "TYPE"}
                  </span>
                  <strong>{selectedBooking.service ?? selectedBooking.kind}</strong>
                </div>
              </div>
              <div aria-hidden="true" className="booking-ticket__perforation" />
              <footer className="booking-ticket__footer">
                <div>
                  <span>TRIP TO KYOTO</span>
                  <strong>Keep every journey together.</strong>
                </div>
                <span>Sample booking</span>
              </footer>
            </article>
            <button
              className="booking-dialog__share"
              disabled={sharing}
              onClick={() => void shareSelectedBooking()}
              type="button"
            >
              <Share2 aria-hidden="true" size={19} strokeWidth={1.8} />
              {sharing ? "Preparing image…" : "Share card"}
            </button>
            {shareMessage.length > 0 ? (
              <p className="booking-dialog__message" role="status">
                {shareMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

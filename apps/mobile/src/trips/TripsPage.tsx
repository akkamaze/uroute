import "../keyboard/keyboard-search.css";
import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { advanceFormField } from "../keyboard/advance-form-field";
import "../keyboard/keyboard-dialog.css";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useAccount } from "@uroute/auth/useAccount";
import {
  Camera,
  ChevronRight,
  ClipboardCheck,
  MapPin,
  Plus,
  Search,
  Tickets,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAppMode } from "../app-mode";
import { PackingListDialog } from "./PackingListDialog";
import { trips, type TripPeriod, type TripSummary } from "./trips-data";
import { createTrip, loadCreatedTrips, type CreatedTrip } from "./trip-store";
import { importLocalTripToAccount } from "./trip-account-import";
import { tripCoverUrl, uploadTripCover } from "./trip-cover";
import { createAccountTrip, loadAccountTrips, type AccountTrip } from "../plan/account-plan";
import "./trips.css";

interface TripCardProps {
  trip: TripSummary;
}

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const day = new Intl.DateTimeFormat("en", { day: "numeric" });
  const month = new Intl.DateTimeFormat("en", { month: "short" });

  if (sameMonth) {
    return `${day.format(start)}–${day.format(end)} ${month.format(end)} ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${day.format(start)} ${month.format(start)}–${day.format(end)} ${month.format(end)} ${end.getFullYear()}`;
  }

  const full = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${full.format(start)}–${full.format(end)}`;
}

function FeaturedTrip({ trip }: TripCardProps): React.JSX.Element {
  return (
    <article className="featured-trip">
      <img alt={trip.imageAlt} className="featured-trip__image" src={trip.imageSrc} />

      <Link
        aria-label={`Open ${trip.name} trip plan`}
        className="featured-trip__summary"
        to="/plan"
      >
        <div className="featured-trip__title">
          <h2>{trip.name}</h2>
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </div>
        <p>
          {trip.dateLabel} · {trip.durationLabel}
        </p>
      </Link>
      <div className="featured-trip__members">
        <div>
          <img alt="Trip members" src="/images/members.png" />
          <span>You + 3</span>
        </div>

        <Link to="/plan">Open plan</Link>
      </div>
    </article>
  );
}

function TripCoverButton({
  tripId,
  onCoverChange,
}: {
  tripId: string;
  onCoverChange: (tripId: string, coverVersion: string) => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function chooseCover(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      onCoverChange(tripId, await uploadTripCover(tripId, file));
    } catch {
      setMessage("Could not update the cover photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        aria-label="Change cover photo"
        className="trip-cover-button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Camera aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>
      <input
        accept="image/*"
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => void chooseCover(event)}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      {message ? (
        <span className="sr-only" role="status">
          {message}
        </span>
      ) : null}
    </>
  );
}

function tripCover(trip: CreatedTrip | AccountTrip): string | null {
  return "coverVersion" in trip && trip.coverVersion
    ? tripCoverUrl(trip.id, trip.coverVersion)
    : null;
}

function CreatedFeaturedTrip({
  trip,
  onImport,
  onCoverChange,
}: {
  trip: CreatedTrip | AccountTrip;
  onImport?: (() => void) | undefined;
  onCoverChange?: ((tripId: string, coverVersion: string) => void) | undefined;
}): React.JSX.Element {
  const cover = tripCover(trip);
  const days =
    Math.round(
      (Date.parse(`${trip.endDate}T12:00:00Z`) - Date.parse(`${trip.startDate}T12:00:00Z`)) /
        86_400_000,
    ) + 1;
  const dates = formatDateRange(
    new Date(`${trip.startDate}T12:00:00Z`),
    new Date(`${trip.endDate}T12:00:00Z`),
  );

  return (
    <article className="featured-trip">
      <div className="featured-trip__cover">
        {cover ? (
          <img alt={`${trip.name} cover`} className="featured-trip__image" src={cover} />
        ) : (
          <div aria-hidden="true" className="featured-trip__created-cover">
            <MapPin size={42} strokeWidth={1.4} />
          </div>
        )}
        {onCoverChange ? <TripCoverButton onCoverChange={onCoverChange} tripId={trip.id} /> : null}
      </div>
      <Link
        aria-label={`Open ${trip.name} trip plan`}
        className="featured-trip__summary"
        params={{ tripId: trip.id }}
        to="/plan/trip/$tripId"
      >
        <div className="featured-trip__title">
          <h2>{trip.name}</h2>
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </div>
        <p>
          {dates} · {days} {days === 1 ? "day" : "days"}
        </p>
      </Link>
      <div className="featured-trip__members">
        {onImport ? (
          <button className="trip-account-action" onClick={onImport} type="button">
            Copy to account
          </button>
        ) : (
          <span>Your plan</span>
        )}
        <Link params={{ tripId: trip.id }} to="/plan/trip/$tripId">
          Open plan
        </Link>
      </div>
    </article>
  );
}

function CompactTrip({ trip }: TripCardProps): React.JSX.Element {
  const content = (
    <>
      <img alt={trip.imageAlt} src={trip.imageSrc} />

      <div>
        <h2>{trip.name}</h2>
        <p>
          {trip.dateLabel} · {trip.durationLabel}
        </p>
      </div>
    </>
  );

  return trip.id === "kyoto" ? (
    <Link className="compact-trip" to="/plan">
      {content}
    </Link>
  ) : (
    <article className="compact-trip">{content}</article>
  );
}

function CreatedCompactTrip({
  trip,
  onImport,
  onCoverChange,
}: {
  trip: CreatedTrip | AccountTrip;
  onImport?: (() => void) | undefined;
  onCoverChange?: ((tripId: string, coverVersion: string) => void) | undefined;
}): React.JSX.Element {
  const cover = tripCover(trip);
  const start = new Date(`${trip.startDate}T12:00:00Z`);
  const end = new Date(`${trip.endDate}T12:00:00Z`);
  const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return (
    <div className="created-compact-trip">
      <Link className="compact-trip" params={{ tripId: trip.id }} to="/plan/trip/$tripId">
        {cover ? (
          <img alt={`${trip.name} cover`} src={cover} />
        ) : (
          <span aria-hidden="true" className="compact-trip__placeholder">
            <MapPin size={24} strokeWidth={1.7} />
          </span>
        )}
        <span className="compact-trip__copy">
          <strong>{trip.name}</strong>
          <span>
            {formatDateRange(start, end)} · {duration} {duration === 1 ? "day" : "days"}
          </span>
        </span>
      </Link>
      {onCoverChange ? <TripCoverButton onCoverChange={onCoverChange} tripId={trip.id} /> : null}
      {onImport ? (
        <button className="trip-account-action" onClick={onImport} type="button">
          Copy to account
        </button>
      ) : null}
    </div>
  );
}

function BeforeYouGo({
  onOpenPacking,
  tripName,
}: {
  onOpenPacking: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tripName: string;
}): React.JSX.Element {
  return (
    <section className="before-you-go">
      <h2>Before you go</h2>
      <Link className="preparation-row" to="/bookings">
        <Tickets aria-hidden="true" className="preparation-row__icon" size={30} strokeWidth={1.7} />
        <span className="preparation-row__copy">
          <strong>Bookings</strong>
          <span>Across all your trips</span>
        </span>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} />
      </Link>
      <button className="preparation-row" onClick={onOpenPacking} type="button">
        <ClipboardCheck
          aria-hidden="true"
          className="preparation-row__icon"
          size={30}
          strokeWidth={1.7}
        />
        <span className="preparation-row__copy">
          <strong>Packing list</strong>
          <span>Get ready for {tripName}</span>
        </span>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>
    </section>
  );
}
export function TripsPage(): React.JSX.Element {
  const mode = useAppMode();
  const account = useAccount();
  const accountUserId = account.user?.id;
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/trips" });
  const packingOpen = search.packing === "open";
  const packingOpenerRef = useRef<HTMLButtonElement | null>(null);
  const packingOpenedHereRef = useRef(false);
  const packingWasOpenRef = useRef(false);
  useEffect(() => {
    if (packingOpen) {
      packingWasOpenRef.current = true;
    } else if (packingWasOpenRef.current) {
      packingOpenerRef.current?.focus();
      packingWasOpenRef.current = false;
      packingOpenedHereRef.current = false;
    }
  }, [packingOpen]);
  function openPacking(event: React.MouseEvent<HTMLButtonElement>): void {
    packingOpenerRef.current = event.currentTarget;
    packingOpenedHereRef.current = true;
    void navigate({ to: "/trips", search: { packing: "open" }, resetScroll: false });
  }
  function closePacking(): void {
    if (packingOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ to: "/trips", search: {}, replace: true, resetScroll: false });
    }
  }
  const [period, setPeriod] = useState<TripPeriod>("upcoming");
  const [query, setQuery] = useState("");
  const [createdTrips, setCreatedTrips] = useState<CreatedTrip[]>(loadCreatedTrips);
  const [accountTrips, setAccountTrips] = useState<AccountTrip[]>([]);
  const [tripToImport, setTripToImport] = useState<CreatedTrip | null>(null);
  const [importingToAccount, setImportingToAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const accountDialogRef = useRef<HTMLDialogElement>(null);
  const newTripOpen = mode === "real" && search.newTrip === "open";
  const newTripButtonRef = useRef<HTMLButtonElement>(null);
  const newTripOpenedHereRef = useRef(false);
  const newTripWasOpenRef = useRef(false);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("2027-01-10");
  const [endDate, setEndDate] = useState("2027-01-14");
  const [formMessage, setFormMessage] = useState("");
  const [resultsScrollable, setResultsScrollable] = useState(false);
  const newTripDialogRef = useRef<HTMLDialogElement>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTrips =
    mode === "mock"
      ? trips.filter(
          (trip) =>
            trip.period === period && trip.name.toLocaleLowerCase().includes(normalizedQuery),
        )
      : [];
  const displayTrips =
    mode === "real"
      ? [
          ...accountTrips,
          ...createdTrips.filter((trip) => !accountTrips.some((remote) => remote.id === trip.id)),
        ]
      : [];
  const visibleCreatedTrips = displayTrips
    .filter(
      (trip) =>
        trip.name.toLocaleLowerCase().includes(normalizedQuery) &&
        (period === "upcoming") === trip.endDate >= new Date().toISOString().slice(0, 10),
    )
    .sort((left, right) =>
      period === "upcoming"
        ? left.startDate.localeCompare(right.startDate)
        : right.endDate.localeCompare(left.endDate),
    );

  useEffect(() => {
    if (mode !== "real" || !accountUserId) {
      setAccountTrips([]);

      return;
    }
    let active = true;
    void loadAccountTrips()
      .then((rows) => {
        if (active) {
          setAccountTrips(rows);
        }
      })
      .catch(() => {
        if (active) {
          setAccountMessage("Could not load account trips. Showing trips saved on this device.");
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId, mode]);

  useEffect(() => {
    const dialog = accountDialogRef.current;
    if (dialog !== null && tripToImport !== null && !dialog.open) {
      dialog.showModal();
    } else if (dialog !== null && tripToImport === null && dialog.open) {
      dialog.close();
    }
  }, [tripToImport]);

  function changeCover(tripId: string, coverVersion: string): void {
    setAccountTrips((current) =>
      current.map((trip) => (trip.id === tripId ? { ...trip, coverVersion } : trip)),
    );
  }

  async function confirmAccountImport(): Promise<void> {
    if (!tripToImport || importingToAccount || !account.user) {
      return;
    }
    setImportingToAccount(true);
    setAccountMessage("");
    try {
      const copied = await importLocalTripToAccount(tripToImport, account.user.id);
      setAccountMessage(
        `${tripToImport.name}, ${copied.entries} visible itinerary ${copied.entries === 1 ? "row" : "rows"} and ${copied.drafts} saved ${copied.drafts === 1 ? "draft" : "drafts"} copied to your account. Imported map pins and edit history remain on this device.`,
      );
      setTripToImport(null);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Could not copy this trip.");
      setTripToImport(null);
    } finally {
      setImportingToAccount(false);
    }
  }

  useEffect(() => {
    const dialog = newTripDialogRef.current;

    if (dialog === null) {
      return;
    }

    if (newTripOpen && !dialog.open) {
      newTripWasOpenRef.current = true;
      dialog.showModal();
      destinationRef.current?.focus();
    } else if (!newTripOpen && newTripWasOpenRef.current) {
      dialog.close();
      newTripButtonRef.current?.focus();
      newTripWasOpenRef.current = false;
      newTripOpenedHereRef.current = false;
    }
  }, [newTripOpen]);

  useLayoutEffect(() => {
    const scroller = resultsScrollRef.current;

    if (scroller === null) {
      return undefined;
    }

    const scrollElement = scroller;

    function updateScrollable(): void {
      setResultsScrollable(scrollElement.scrollHeight > scrollElement.clientHeight + 1);
    }

    updateScrollable();
    const observer = new ResizeObserver(updateScrollable);
    observer.observe(scrollElement);
    Array.from(scrollElement.children).forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [normalizedQuery, period, visibleTrips.length]);

  function selectPeriod(nextPeriod: TripPeriod): void {
    setPeriod(nextPeriod);
  }

  function openNewTrip(): void {
    newTripOpenedHereRef.current = true;
    void navigate({ to: "/trips", search: { newTrip: "open" }, resetScroll: false });
  }

  function closeNewTrip(): void {
    if (!beginDialogDismissal(newTripDialogRef.current)) {
      return;
    }
    setFormMessage("");
    if (newTripOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ to: "/trips", search: {}, replace: true, resetScroll: false });
    }
  }
  async function createDraftTrip(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = destination.trim();

    if (name.length === 0 || startDate.length === 0 || endDate.length === 0) {
      setFormMessage("Add a destination and travel dates.");

      return;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (duration < 1) {
      setFormMessage("End date must be on or after the start date.");

      return;
    }

    let createdTrip: CreatedTrip;
    try {
      if (account.user) {
        const trip = await createAccountTrip({ id: crypto.randomUUID(), name, startDate, endDate });
        createdTrip = trip;
        setAccountTrips((current) => [...current, trip]);
      } else {
        const trip = createTrip(name, startDate, endDate);
        createdTrip = trip;
        setCreatedTrips((current) => [...current, trip]);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Could not create this trip.");

      return;
    }
    setDestination("");
    setPeriod(endDate >= new Date().toISOString().slice(0, 10) ? "upcoming" : "past");
    setQuery("");
    void navigate({
      to: "/plan/trip/$tripId",
      params: { tripId: createdTrip.id },
      replace: true,
    });
  }

  return (
    <section className="trips-page keyboard-search-page">
      <div className="trips-page__title">
        <h1>Your trips</h1>
        {mode === "real" ? (
          <button
            className="trips-page__new"
            onClick={openNewTrip}
            ref={newTripButtonRef}
            type="button"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={1.8} />
            New
          </button>
        ) : null}
      </div>

      <label className="trip-search">
        <Search aria-hidden="true" size={21} strokeWidth={1.8} />
        <input
          aria-label="Search your trips"
          data-keyboard-search
          enterKeyHint="search"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your trips"
          type="search"
          value={query}
        />
        {query.length > 0 ? (
          <button aria-label="Clear search" onClick={() => setQuery("")} type="button">
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        ) : null}
      </label>

      <div aria-label="Trip period" className="trip-period" role="tablist">
        {(["upcoming", "past"] as const).map((value) => (
          <button
            aria-selected={period === value}
            className={
              period === value ? "trip-period__tab trip-period__tab--active" : "trip-period__tab"
            }
            key={value}
            onClick={() => selectPeriod(value)}
            role="tab"
            type="button"
          >
            {value === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {accountMessage ? (
        <p aria-live="polite" className="trip-account-message">
          {accountMessage}
        </p>
      ) : null}

      <div
        className={
          resultsScrollable
            ? "trips-page__scroll trips-page__scroll--scrollable"
            : "trips-page__scroll"
        }
        ref={resultsScrollRef}
      >
        <div aria-live="polite" className="trip-results">
          {visibleCreatedTrips.map((trip, index) => {
            if (index === 0 && period === "upcoming" && normalizedQuery.length === 0) {
              return (
                <CreatedFeaturedTrip
                  key={trip.id}
                  trip={trip}
                  {...(account.user && !accountTrips.some((remote) => remote.id === trip.id)
                    ? { onImport: () => setTripToImport(trip) }
                    : {})}
                  {...(account.user && accountTrips.some((remote) => remote.id === trip.id)
                    ? { onCoverChange: changeCover }
                    : {})}
                />
              );
            }

            return (
              <CreatedCompactTrip
                key={trip.id}
                trip={trip}
                {...(account.user && !accountTrips.some((remote) => remote.id === trip.id)
                  ? { onImport: () => setTripToImport(trip) }
                  : {})}
                {...(account.user && accountTrips.some((remote) => remote.id === trip.id)
                  ? { onCoverChange: changeCover }
                  : {})}
              />
            );
          })}
          {visibleTrips.length === 0 && visibleCreatedTrips.length === 0 ? (
            <div className="trip-results__empty">
              <h2>
                {period === "past" && normalizedQuery.length === 0
                  ? "No past trips yet"
                  : "No trips found"}
              </h2>
              <p>
                {period === "past" && normalizedQuery.length === 0
                  ? "Finished trips will appear here."
                  : "Try another city."}
              </p>
            </div>
          ) : (
            visibleTrips.map((trip) =>
              trip.featured && visibleCreatedTrips.length === 0 ? (
                <FeaturedTrip key={trip.name} trip={trip} />
              ) : (
                <CompactTrip key={trip.name} trip={trip} />
              ),
            )
          )}
        </div>

        {period === "upcoming" &&
        normalizedQuery.length === 0 &&
        (mode === "mock" || visibleCreatedTrips.length > 0) ? (
          <BeforeYouGo
            onOpenPacking={openPacking}
            tripName={mode === "mock" ? "Kyoto" : (visibleCreatedTrips[0]?.name ?? "your trip")}
          />
        ) : null}
      </div>

      <PackingListDialog
        key={mode === "mock" ? "mock" : (visibleCreatedTrips[0]?.id ?? "real")}
        onClose={closePacking}
        open={packingOpen}
        {...(mode === "real" && visibleCreatedTrips[0]
          ? { tripId: visibleCreatedTrips[0].id }
          : {})}
        tripName={mode === "mock" ? "Kyoto" : (visibleCreatedTrips[0]?.name ?? "your trip")}
      />

      <dialog
        aria-labelledby="trip-account-title"
        className="trip-account-dialog"
        onCancel={(event) => {
          if (importingToAccount) {
            event.preventDefault();
          } else {
            setTripToImport(null);
          }
        }}
        ref={accountDialogRef}
      >
        <h2 id="trip-account-title">Copy {tripToImport?.name} to your account?</h2>
        <p>
          This copies trip details, visible itinerary rows and current unsaved drafts. KML map pins,
          removed rows and version history stay on this device for now. Later edits are not synced
          automatically yet. Copying again can refresh only rows and drafts this device previously
          copied; changes from another device will be rejected.
        </p>
        <div>
          <button disabled={importingToAccount} onClick={() => setTripToImport(null)} type="button">
            Cancel
          </button>
          <button
            disabled={importingToAccount}
            onClick={() => void confirmAccountImport()}
            type="button"
          >
            {importingToAccount ? "Copying…" : "Copy trip"}
          </button>
        </div>
      </dialog>

      <dialog
        aria-labelledby="new-trip-title"
        className="new-trip-dialog"
        data-keyboard-dialog="center"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeNewTrip();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeNewTrip();
          }
        }}
        ref={newTripDialogRef}
      >
        <form
          className="new-trip-form keyboard-dialog-form"
          onKeyDown={advanceFormField}
          onSubmit={(event) => void createDraftTrip(event)}
        >
          <header>
            <div>
              <h2 id="new-trip-title">New trip</h2>
              <p>Start with a destination and dates.</p>
            </div>
            <button aria-label="Close new trip" onClick={closeNewTrip} type="button">
              <X aria-hidden="true" size={22} strokeWidth={1.8} />
            </button>
          </header>

          <div className="keyboard-dialog-body" data-keyboard-scroll>
            <label>
              Destination
              <input
                enterKeyHint="next"
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Where are you going?"
                ref={destinationRef}
                value={destination}
              />
            </label>

            <div className="new-trip-form__dates">
              <label>
                Start date
                <input
                  enterKeyHint="next"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>
              <label>
                End date
                <input
                  enterKeyHint="done"
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </label>
            </div>

            {formMessage.length > 0 ? (
              <p aria-live="polite" className="new-trip-form__message">
                {formMessage}
              </p>
            ) : null}
          </div>
          <button className="new-trip-form__save" type="submit">
            Create trip
          </button>
        </form>
      </dialog>
    </section>
  );
}

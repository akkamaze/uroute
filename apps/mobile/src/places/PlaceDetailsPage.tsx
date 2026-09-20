import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Clock,
  CreditCard,
  MapPin,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { allowAnyOrientation, preferPortraitOrientation } from "../orientation";
import { createSamplePlaces } from "../plan/map-data";
import { FRIDAY_STOPS, type PlannedStop } from "../plan/plan-data";
import { TripMap } from "../plan/TripMap";
import { toggleSavedPlace, useSavedPlaceIds } from "../saved/saved-store";

import "./places.css";

function getPlace(id: string | undefined): PlannedStop {
  const place = FRIDAY_STOPS.find((candidate) => candidate.id === id) ?? FRIDAY_STOPS[0];

  if (place === undefined) {
    throw new Error("The place preview data is unavailable.");
  }

  return place;
}

type SheetSnap = "collapsed" | "expanded" | "middle";

const TRIP_DAYS = {
  kyoto: {
    days: [
      { id: "2026-11-12", label: "Thursday, 12 November" },
      { id: "2026-11-13", label: "Friday, 13 November" },
      { id: "2026-11-14", label: "Saturday, 14 November" },
      { id: "2026-11-15", label: "Sunday, 15 November" },
      { id: "2026-11-16", label: "Monday, 16 November" },
    ],
    label: "Kyoto · 12–16 Nov 2026",
    name: "Kyoto",
  },
  danang: {
    days: [
      { id: "2026-12-04", label: "Friday, 4 December" },
      { id: "2026-12-05", label: "Saturday, 5 December" },
      { id: "2026-12-06", label: "Sunday, 6 December" },
      { id: "2026-12-07", label: "Monday, 7 December" },
    ],
    label: "Da Nang · 4–7 Dec 2026",
    name: "Da Nang",
  },
} as const;

type TripId = keyof typeof TRIP_DAYS;

const SHEET_FLING_VELOCITY = 0.75;
const SHEET_MIN_FLING_DISTANCE = 64;
const SHEET_MIN_DRAG_INTENT = 18;

function getSheetVisibleHeight(snap: SheetSnap): number {
  if (snap === "expanded") {
    return Number.POSITIVE_INFINITY;
  }

  if (snap === "middle") {
    return (window.innerHeight - 72) * 0.55;
  }

  return 132;
}

function getSheetOffset(snap: SheetSnap): number {
  if (snap === "expanded") {
    return 0;
  }

  const sheetHeight = window.innerHeight - 72;

  return Math.max(0, sheetHeight - getSheetVisibleHeight(snap));
}

function getDragOffset(snap: SheetSnap, delta: number): number {
  const baseOffset = getSheetOffset(snap);
  const maximumOffset = getSheetOffset("collapsed");

  return Math.min(maximumOffset - baseOffset, Math.max(-baseOffset, delta));
}

function resolveSheetSnap(current: SheetSnap, delta: number, duration: number): SheetSnap {
  const sheetHeight = window.innerHeight - 72;
  const releasedOffset = getSheetOffset(current) + getDragOffset(current, delta);
  const releasedRatio = releasedOffset / sheetHeight;
  const velocity = delta / Math.max(1, duration);
  const flingDistance = Math.max(SHEET_MIN_FLING_DISTANCE, window.innerHeight * 0.08);

  if (Math.abs(delta) >= flingDistance && Math.abs(velocity) >= SHEET_FLING_VELOCITY) {
    return delta < 0 ? "expanded" : "collapsed";
  }

  if (current === "collapsed" && delta <= -SHEET_MIN_DRAG_INTENT && releasedRatio > 0.28) {
    return "middle";
  }

  if (current === "expanded" && delta >= SHEET_MIN_DRAG_INTENT && releasedRatio < 0.7) {
    return "middle";
  }

  if (releasedRatio <= 0.28) {
    return "expanded";
  }

  if (releasedRatio >= 0.7) {
    return "collapsed";
  }

  return "middle";
}

export function PlaceDetailsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/places" });
  const initialPlace = getPlace(search.place);
  const initialId = initialPlace.id;
  const [selectedId, setSelectedId] = useState(initialId);
  const [draftQuery, setDraftQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const savedIds = useSavedPlaceIds();
  const [notice, setNotice] = useState("");
  const [visitTime, setVisitTime] = useState(initialPlace.time);
  const [notes, setNotes] = useState("");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("middle");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [tripId, setTripId] = useState<TripId>("kyoto");
  const [tripDay, setTripDay] = useState("2026-11-13");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const dragStartTimeRef = useRef(0);
  const dragMovedRef = useRef(false);
  const previousSheetSnapRef = useRef<SheetSnap>("middle");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const places = useMemo(createSamplePlaces, []);
  const selectedPlace = getPlace(selectedId);
  const saved = savedIds.has(selectedPlace.id);
  const results = FRIDAY_STOPS.filter((place) =>
    place.name.toLowerCase().includes(submittedQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    allowAnyOrientation();

    return preferPortraitOrientation;
  }, []);

  function selectPlace(id: string): void {
    const nextPlace = getPlace(id);

    setSelectedId(id);
    setDraftQuery("");
    setSubmittedQuery("");
    setSearchActive(false);
    setVisitTime(nextPlace.time);
    setNotes("");
    void navigate({ replace: true, search: { place: id }, to: "/places" });
  }

  function cancelSearch(): void {
    setDraftQuery("");
    setSubmittedQuery("");
    setSearchActive(false);
    searchInputRef.current?.blur();
  }

  function openAddDialog(): void {
    previousSheetSnapRef.current = sheetSnap;
    setAddPanelOpen(true);
    setSheetSnap("expanded");
  }

  function closeAddPanel(): void {
    setAddPanelOpen(false);
    setSheetSnap(previousSheetSnapRef.current);
  }

  function changeTrip(nextTripId: TripId): void {
    setTripId(nextTripId);
    setTripDay(TRIP_DAYS[nextTripId].days[0].id);
  }

  function addToTrip(): void {
    const trip = TRIP_DAYS[tripId];
    const day = trip.days.find((candidate) => candidate.id === tripDay) ?? trip.days[0];

    setNotice(`Added to ${trip.name} · ${day.label} for this session.`);
    closeAddPanel();
  }

  function toggleSaved(): void {
    toggleSavedPlace(selectedPlace.id);
  }

  function startSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;

    if (addPanelOpen || target.closest("button, a, input, select, textarea, summary") !== null) {
      return;
    }

    if (sheetSnap === "expanded" && target.closest(".place-sheet__drag-zone") === null) {
      return;
    }

    event.preventDefault();
    dragStartRef.current = event.clientY;
    dragStartTimeRef.current = performance.now();
    dragMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startHandleDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (addPanelOpen) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    dragStartRef.current = event.clientY;
    dragStartTimeRef.current = performance.now();
    dragMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveHandle(event: React.PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    moveSheet(event);
  }

  function finishHandleDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    finishSheetDrag(event);
  }

  function moveSheet(event: React.PointerEvent<HTMLElement>): void {
    if (dragStartRef.current === null) {
      return;
    }

    const delta = event.clientY - dragStartRef.current;

    if (Math.abs(delta) > 6) {
      dragMovedRef.current = true;
    }

    setDragOffset(getDragOffset(sheetSnap, delta));
  }

  function cancelSheetDrag(): void {
    dragStartRef.current = null;
    dragMovedRef.current = false;
    setDragOffset(0);
  }

  function finishSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    if (dragStartRef.current === null) {
      return;
    }

    const delta = event.clientY - dragStartRef.current;
    const duration = performance.now() - dragStartTimeRef.current;

    dragStartRef.current = null;
    setDragOffset(0);

    setSheetSnap(resolveSheetSnap(sheetSnap, delta, duration));
  }

  function cycleSheet(): void {
    if (addPanelOpen) {
      return;
    }

    if (dragMovedRef.current) {
      dragMovedRef.current = false;

      return;
    }

    setSheetSnap((current) => {
      if (current === "collapsed") {
        return "middle";
      }

      if (current === "middle") {
        return "expanded";
      }

      return "middle";
    });
  }

  return (
    <main className="places-page">
      <section className="places-page__map">
        <TripMap
          bottomInset={sheetSnap === "expanded" ? 0 : getSheetVisibleHeight(sheetSnap)}
          onSelect={selectPlace}
          places={places}
          selectedId={selectedPlace.id}
          showLocate={sheetSnap !== "expanded"}
          variant="discovery"
        />

        <div className="place-search" data-active={searchActive ? "true" : undefined}>
          {searchActive ? (
            <button
              aria-label="Cancel search"
              className="place-search__back"
              onClick={cancelSearch}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
            </button>
          ) : null}

          <form
            className="place-search__form"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedQuery(draftQuery);
            }}
          >
            <Search aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              aria-label="Search places"
              enterKeyHint="search"
              onFocus={() => setSearchActive(true)}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search places"
              ref={searchInputRef}
              type="search"
              value={draftQuery}
            />
          </form>
        </div>

        {submittedQuery === "" ? null : (
          <div className="place-search__results">
            {results.length === 0 ? (
              <p>No places found.</p>
            ) : (
              results.map((place) => (
                <button key={place.id} onClick={() => selectPlace(place.id)} type="button">
                  <MapPin aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span>{place.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      <section
        aria-label="Place details"
        className="place-sheet"
        data-dragging={dragOffset === 0 ? undefined : "true"}
        data-mode={addPanelOpen ? "add" : undefined}
        data-snap={sheetSnap}
        onLostPointerCapture={cancelSheetDrag}
        onPointerCancel={cancelSheetDrag}
        onPointerDown={startSheetDrag}
        onPointerMove={moveSheet}
        onPointerUp={finishSheetDrag}
        style={{ transform: `translateY(${getSheetOffset(sheetSnap) + dragOffset}px)` }}
      >
        <div className="place-sheet__drag-zone">
          <button
            aria-label={
              sheetSnap === "expanded" ? "Collapse place details" : "Expand place details"
            }
            className="place-sheet__handle-button"
            onClick={cycleSheet}
            onPointerCancel={cancelSheetDrag}
            onPointerDown={startHandleDrag}
            onPointerMove={moveHandle}
            onPointerUp={finishHandleDrag}
            type="button"
          >
            <span aria-hidden="true" className="place-sheet__handle" />
          </button>

          <header className="place-sheet__title">
            <div>
              <h1>{selectedPlace.name}</h1>
              <p>
                {selectedPlace.type} · {selectedPlace.area}
              </p>
            </div>

            <button
              aria-label={saved ? "Remove from saved places" : "Save place"}
              aria-pressed={saved}
              onClick={toggleSaved}
              type="button"
            >
              <Bookmark
                aria-hidden="true"
                fill={saved ? "currentColor" : "none"}
                size={24}
                strokeWidth={1.8}
              />
            </button>
          </header>

          <p className="place-sheet__rating">
            <Star aria-hidden="true" fill="currentColor" size={17} strokeWidth={1.8} />
            <strong>{selectedPlace.rating}</strong>
            <span>({selectedPlace.reviews})</span>
          </p>
        </div>

        <div className="place-sheet__content">
          {addPanelOpen ? (
            <form
              className="add-place-panel"
              onSubmit={(event) => {
                event.preventDefault();
                addToTrip();
              }}
            >
              <div className="add-place-panel__heading">
                <button aria-label="Back to place details" onClick={closeAddPanel} type="button">
                  <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
                </button>
                <div>
                  <p>Add to trip</p>
                  <h2>Choose a trip and day</h2>
                </div>
              </div>

              <label>
                Trip
                <span className="add-place-panel__select">
                  <select
                    onChange={(event) => changeTrip(event.target.value as TripId)}
                    value={tripId}
                  >
                    {Object.entries(TRIP_DAYS).map(([id, trip]) => (
                      <option key={id} value={id}>
                        {trip.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
                </span>
              </label>

              <label>
                Day
                <span className="add-place-panel__select">
                  <select onChange={(event) => setTripDay(event.target.value)} value={tripDay}>
                    {TRIP_DAYS[tripId].days.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
                </span>
              </label>

              <button className="add-place-panel__confirm" type="submit">
                Add to plan
              </button>
            </form>
          ) : (
            <>
              <div className="place-sheet__photos">
                <img alt={selectedPlace.name} src={selectedPlace.image} />
                <img alt={`${selectedPlace.name} surroundings`} src={selectedPlace.secondImage} />
              </div>

              <div className="place-sheet__actions">
                <button className="place-sheet__primary" onClick={openAddDialog} type="button">
                  Add to trip
                </button>
                <button
                  className="place-sheet__secondary"
                  onClick={() => setNotice("Live directions are not connected yet.")}
                  type="button"
                >
                  Directions
                </button>
              </div>

              <div className="place-sheet__row">
                <MapPin aria-hidden="true" size={21} strokeWidth={1.8} />
                <span>{selectedPlace.address}</span>
              </div>
              <div className="place-sheet__row">
                <Clock aria-hidden="true" size={21} strokeWidth={1.8} />
                <span>{selectedPlace.hours}</span>
              </div>
              <div className="place-sheet__row">
                <CreditCard aria-hidden="true" size={21} strokeWidth={1.8} />
                <span>Credit card · Cash</span>
              </div>

              <details className="place-sheet__edit">
                <summary>Edit visit details</summary>
                <div className="place-sheet__edit-fields">
                  <label>
                    Visit time
                    <input
                      onChange={(event) => setVisitTime(event.target.value)}
                      type="time"
                      value={visitTime}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add a note for this visit"
                      rows={2}
                      value={notes}
                    />
                  </label>
                </div>
              </details>

              <p aria-live="polite" className="place-sheet__notice">
                {notice}
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

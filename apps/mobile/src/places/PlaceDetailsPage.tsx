import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { allowAnyOrientation, preferPortraitOrientation } from "../orientation";
import { createSamplePlaces } from "../plan/map-data";
import { FRIDAY_STOPS, type PlannedStop } from "../plan/plan-data";
import { TripMap } from "../plan/TripMap";
import {
  addPlaceToKyotoDay,
  getKyotoPlan,
  isKyotoDay,
  useKyotoPlan,
  updateKyotoVisit,
  type KyotoDay,
} from "../plan/plan-store";
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
  const selectionHistoryBoundary = useRouterState({
    select: (state) =>
      "placeSelectionEntry" in state.location.state &&
      state.location.state.placeSelectionEntry === true,
  });
  const mapExpanded = search.map === "full";
  const mapOpenedHereRef = useRef(false);
  const mapWasExpandedRef = useRef(false);
  const initialPlace = getPlace(search.place);
  const initialId = initialPlace.id;
  const plan = useKyotoPlan();
  const initialVisit =
    search.day === undefined
      ? undefined
      : plan.days[search.day].find((visit) => visit.placeId === initialId);
  const selectedId = initialId;
  const [draftQuery, setDraftQuery] = useState(search.q ?? "");
  const submittedQuery = search.q ?? "";
  const searchActive = search.search === "open";
  const savedIds = useSavedPlaceIds();
  const [notice, setNotice] = useState("");
  const [addedDay, setAddedDay] = useState<KyotoDay | null>(null);
  const [addError, setAddError] = useState("");
  const [visitTime, setVisitTime] = useState(initialVisit?.time ?? "");
  const [notes, setNotes] = useState(initialVisit?.notes ?? "");
  const [timeEdited, setTimeEdited] = useState(false);
  const [notesEdited, setNotesEdited] = useState(false);
  const [visitSaveNotice, setVisitSaveNotice] = useState("");
  const [visitSaveError, setVisitSaveError] = useState("");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("middle");
  const addPanelOpen = search.add === "open";
  const visibleSheetSnap = addPanelOpen ? "expanded" : sheetSnap;
  const [tripId, setTripId] = useState<TripId>("kyoto");
  const [tripDay, setTripDay] = useState(`2026-11-${search.day ?? 13}`);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const dragStartTimeRef = useRef(0);
  const dragMovedRef = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addBackButtonRef = useRef<HTMLButtonElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const addOpenedHereRef = useRef(false);
  const addWasOpenRef = useRef(false);
  const previousContentScrollRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const searchOpenedHereRef = useRef(false);
  const searchWasOpenRef = useRef(false);
  const places = useMemo(createSamplePlaces, []);
  const selectedPlace = getPlace(selectedId);
  const saved = savedIds.has(selectedPlace.id);
  const destination = places.features.find((place) => place.properties.id === selectedPlace.id)
    ?.geometry.coordinates;
  const directionsQuery = new URLSearchParams({
    api: "1",
    destination:
      destination === undefined
        ? `${selectedPlace.name}, ${selectedPlace.address}, Kyoto, Japan`
        : `${destination[1]},${destination[0]}`,
  });
  const visitChanged =
    initialVisit !== undefined && (visitTime !== initialVisit.time || notes !== initialVisit.notes);
  const visitDayLabel = TRIP_DAYS.kyoto.days.find(
    (day) => day.id === `2026-11-${search.day}`,
  )?.label;
  const results = FRIDAY_STOPS.filter((place) =>
    place.name.toLowerCase().includes(submittedQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    allowAnyOrientation();

    return preferPortraitOrientation;
  }, []);

  useLayoutEffect(() => {
    setVisitTime(initialVisit?.time ?? "");
    setNotes(initialVisit?.notes ?? "");
    setTimeEdited(false);
    setNotesEdited(false);
    setNotice("");
    setAddedDay(null);
  }, [initialId, search.day, initialVisit?.time, initialVisit?.notes]);

  useLayoutEffect(() => {
    if (searchActive) {
      searchWasOpenRef.current = true;
      setDraftQuery(submittedQuery);
      if (submittedQuery === "") {
        searchInputRef.current?.focus({ preventScroll: true });
      }
    } else if (searchWasOpenRef.current) {
      searchWasOpenRef.current = false;
      searchOpenedHereRef.current = false;
      setDraftQuery("");
      searchBarRef.current?.focus({ preventScroll: true });
    }
  }, [searchActive, submittedQuery]);

  useEffect(() => {
    if (mapExpanded) {
      mapWasExpandedRef.current = true;
    } else if (mapWasExpandedRef.current) {
      mapWasExpandedRef.current = false;
      mapOpenedHereRef.current = false;
    }
  }, [mapExpanded]);

  function changeMapExpanded(next: boolean): void {
    if (next) {
      mapOpenedHereRef.current = true;
      void navigate({
        to: "/places",
        search: { ...search, map: "full" },
        state: (current) => current,
        resetScroll: false,
      });
    } else if (mapOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/places",
        search: { place: selectedId, ...(search.day === undefined ? {} : { day: search.day }) },
        state: (current) => current,
        replace: true,
        resetScroll: false,
      });
    }
  }

  function selectPlace(id: string): void {
    void navigate({
      replace: true,
      search: { place: id, ...(search.day === undefined ? {} : { day: search.day }) },
      to: "/places",
      state: (current) => ({
        ...current,
        placeSelectionEntry:
          searchActive ||
          mapExpanded ||
          ("placeSelectionEntry" in current && current.placeSelectionEntry === true),
      }),
      resetScroll: false,
    });
  }

  function openSearch(): void {
    if (searchActive) {
      return;
    }
    searchOpenedHereRef.current = true;
    void navigate({
      to: "/places",
      state: (current) => current,
      search: { ...search, place: selectedId, search: "open" },
      resetScroll: false,
    });
  }

  function submitSearch(): void {
    const query = draftQuery.trim().slice(0, 120);
    void navigate({
      to: "/places",
      state: (current) => current,
      search: {
        place: selectedId,
        ...(search.day === undefined ? {} : { day: search.day }),
        search: "open",
        ...(query === "" ? {} : { q: query }),
      },
      replace: true,
      resetScroll: false,
    });
    searchInputRef.current?.blur();
  }

  function cancelSearch(): void {
    if (searchOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/places",
        state: (current) => current,
        search: { place: selectedId, ...(search.day === undefined ? {} : { day: search.day }) },
        replace: true,
        resetScroll: false,
      });
    }
  }

  useLayoutEffect(() => {
    if (addPanelOpen) {
      addWasOpenRef.current = true;
      addBackButtonRef.current?.focus({ preventScroll: true });
      sheetContentRef.current?.scrollTo({ top: 0 });
    } else if (addWasOpenRef.current) {
      addWasOpenRef.current = false;
      addOpenedHereRef.current = false;
      addButtonRef.current?.focus({ preventScroll: true });
      sheetContentRef.current?.scrollTo({ top: previousContentScrollRef.current });
    }
  }, [addPanelOpen]);

  function openAddDialog(): void {
    previousContentScrollRef.current = sheetContentRef.current?.scrollTop ?? 0;
    setAddError("");
    addOpenedHereRef.current = true;
    void navigate({
      to: "/places",
      state: (current) => current,
      search: { ...search, place: selectedId, add: "open" },
      resetScroll: false,
    });
  }

  function closeAddPanel(): void {
    if (addOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/places",
        state: (current) => current,
        search: { place: selectedId, ...(search.day === undefined ? {} : { day: search.day }) },
        replace: true,
        resetScroll: false,
      });
    }
  }

  useEffect(() => {
    setVisitSaveNotice("");
    setVisitSaveError("");
  }, [initialId, search.day]);

  function saveVisit(): void {
    if (search.day === undefined || initialVisit === undefined || !visitChanged) {
      return;
    }
    const saved = updateKyotoVisit(search.day, { placeId: selectedId, time: visitTime, notes });
    if (!saved) {
      setVisitSaveError("This visit could not be saved. Check the time and notes, then try again.");

      return;
    }
    setVisitSaveError("");
    setVisitSaveNotice(
      getKyotoPlan().persistenceFailed
        ? "Changes are kept for this session. Device storage is unavailable."
        : "Changes saved on this device.",
    );
  }

  function changeTrip(nextTripId: TripId): void {
    setAddError("");
    setTripId(nextTripId);
    setTripDay(TRIP_DAYS[nextTripId].days[0].id);
  }

  function addToTrip(): void {
    const trip = TRIP_DAYS[tripId];
    const day = trip.days.find((candidate) => candidate.id === tripDay) ?? trip.days[0];
    const date = Number(day.id.slice(-2));
    if (!isKyotoDay(date)) {
      return;
    }
    const result = addPlaceToKyotoDay(date, {
      placeId: selectedPlace.id,
      time: timeEdited ? visitTime : "",
      notes: notesEdited ? notes : "",
    });
    if (result === "invalid") {
      setAddError("Check the visit time and keep notes under 5,000 characters.");

      return;
    }
    if (result === "duplicate") {
      setAddError(`Already in your plan for ${day.label}. Choose another day.`);

      return;
    }
    setAddedDay(date);
    setTimeEdited(false);
    setNotesEdited(false);
    setNotice(
      `Added to ${trip.name} · ${day.label}.${getKyotoPlan().persistenceFailed ? " Kept for this session; device storage is unavailable." : ""}`,
    );
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
    <main
      className="places-page"
      data-swipe-back-ignore={
        addPanelOpen || searchActive || mapExpanded || selectionHistoryBoundary ? "true" : undefined
      }
      onKeyDown={(event) => {
        if (
          (addPanelOpen || searchActive || mapExpanded) &&
          event.key === "Escape" &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (mapExpanded) {
            changeMapExpanded(false);
          } else if (addPanelOpen) {
            closeAddPanel();
          } else {
            cancelSearch();
          }
        }
      }}
    >
      <section
        aria-hidden={addPanelOpen || undefined}
        className="places-page__map"
        inert={addPanelOpen}
      >
        <TripMap
          bottomInset={
            mapExpanded || visibleSheetSnap === "expanded"
              ? 0
              : getSheetVisibleHeight(visibleSheetSnap)
          }
          expanded={mapExpanded}
          onExpandedChange={changeMapExpanded}
          onSelect={selectPlace}
          places={places}
          selectedId={selectedPlace.id}
          showLocate={mapExpanded || visibleSheetSnap !== "expanded"}
          variant="discovery"
        />

        <div
          aria-hidden={mapExpanded || undefined}
          inert={mapExpanded}
          aria-label="Place search"
          className="place-search"
          data-active={searchActive ? "true" : undefined}
          ref={searchBarRef}
          role="search"
          tabIndex={-1}
        >
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
              submitSearch();
            }}
          >
            <Search aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              aria-label="Search places"
              enterKeyHint="search"
              onFocus={openSearch}
              onChange={(event) => setDraftQuery(event.target.value)}
              maxLength={120}
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
        aria-hidden={mapExpanded || undefined}
        inert={mapExpanded}
        aria-label="Place details"
        className="place-sheet"
        data-dragging={dragOffset === 0 ? undefined : "true"}
        data-mode={addPanelOpen ? "add" : undefined}
        data-snap={visibleSheetSnap}
        onLostPointerCapture={cancelSheetDrag}
        onPointerCancel={cancelSheetDrag}
        onPointerDown={startSheetDrag}
        onPointerMove={moveSheet}
        onPointerUp={finishSheetDrag}
        style={{ transform: `translateY(${getSheetOffset(visibleSheetSnap) + dragOffset}px)` }}
      >
        <div className="place-sheet__drag-zone">
          <button
            aria-label={
              sheetSnap === "expanded" ? "Collapse place details" : "Expand place details"
            }
            className="place-sheet__handle-button"
            disabled={addPanelOpen}
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

        <div className="place-sheet__content" ref={sheetContentRef}>
          {addPanelOpen ? (
            <form
              className="add-place-panel"
              onSubmit={(event) => {
                event.preventDefault();
                addToTrip();
              }}
            >
              <div className="add-place-panel__heading">
                <button
                  aria-label="Back to place details"
                  onClick={closeAddPanel}
                  ref={addBackButtonRef}
                  type="button"
                >
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
                  <select
                    onChange={(event) => {
                      setTripDay(event.target.value);
                      setAddError("");
                    }}
                    value={tripDay}
                  >
                    {TRIP_DAYS[tripId].days.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
                </span>
              </label>

              {addError === "" ? null : (
                <p role="alert" className="add-place-panel__error">
                  {addError}
                </p>
              )}

              <button className="add-place-panel__confirm" type="submit">
                Add to plan
              </button>
            </form>
          ) : (
            <>
              {notice === "" ? null : (
                <p aria-live="polite" className="place-sheet__notice">
                  {notice}
                  {addedDay === null ? null : (
                    <Link to="/plan" search={{ day: addedDay }}>
                      View day
                    </Link>
                  )}
                </p>
              )}

              <div className="place-sheet__photos">
                <img alt={selectedPlace.name} src={selectedPlace.image} />
                <img alt={`${selectedPlace.name} surroundings`} src={selectedPlace.secondImage} />
              </div>

              <div className="place-sheet__actions">
                <button
                  className="place-sheet__primary"
                  onClick={openAddDialog}
                  ref={addButtonRef}
                  type="button"
                >
                  Add to trip
                </button>
                <a
                  aria-label={`Directions to ${selectedPlace.name} in Google Maps (opens another app or tab)`}
                  className="place-sheet__secondary"
                  href={`https://www.google.com/maps/dir/?${directionsQuery.toString()}`}
                  rel="noopener noreferrer"
                  target="_blank"
                  title="Open directions in Google Maps"
                >
                  Directions
                  <ExternalLink aria-hidden="true" size={16} strokeWidth={1.8} />
                </a>
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

              <details
                className="place-sheet__edit"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    setSheetSnap("expanded");
                  }
                }}
              >
                <summary>
                  {initialVisit === undefined ? "Visit details" : "Edit visit details"}
                </summary>
                <div className="place-sheet__edit-fields">
                  {initialVisit === undefined ? null : (
                    <p className="place-sheet__visit-context">{visitDayLabel}</p>
                  )}
                  <label>
                    Visit time
                    <input
                      onChange={(event) => {
                        setVisitTime(event.target.value);
                        setTimeEdited(true);
                        setVisitSaveNotice("");
                        setVisitSaveError("");
                      }}
                      type="time"
                      value={visitTime}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setNotesEdited(true);
                        setVisitSaveNotice("");
                        setVisitSaveError("");
                      }}
                      maxLength={5000}
                      placeholder="Add a note for this visit"
                      rows={2}
                      value={notes}
                    />
                  </label>
                  {initialVisit === undefined ? null : (
                    <>
                      <button
                        className="place-sheet__save-visit"
                        disabled={!visitChanged}
                        onClick={saveVisit}
                        type="button"
                      >
                        Save changes
                      </button>
                      <p className="place-sheet__visit-status" role="status">
                        {visitSaveNotice}
                      </p>
                      {visitSaveError === "" ? null : (
                        <p className="add-place-panel__error" role="alert">
                          {visitSaveError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

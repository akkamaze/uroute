import { useCanGoBack, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, Clock, CreditCard, MapPin, Search, Star, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { createSamplePlaces } from "../plan/map-data";
import { FRIDAY_STOPS, type PlannedStop } from "../plan/plan-data";
import { TripMap } from "../plan/TripMap";

import "./places.css";

function getPlace(id: string | undefined): PlannedStop {
  const place = FRIDAY_STOPS.find((candidate) => candidate.id === id) ?? FRIDAY_STOPS[0];

  if (place === undefined) {
    throw new Error("The place preview data is unavailable.");
  }

  return place;
}

type SheetSnap = "collapsed" | "expanded" | "middle";

const SHEET_VISIBLE_HEIGHT: Record<SheetSnap, number> = {
  collapsed: 132,
  expanded: Number.POSITIVE_INFINITY,
  middle: 380,
};

function getSheetOffset(snap: SheetSnap): number {
  if (snap === "expanded") {
    return 0;
  }

  const sheetHeight = window.innerHeight - 72;

  return Math.max(0, sheetHeight - SHEET_VISIBLE_HEIGHT[snap]);
}

export function PlaceDetailsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const search = useSearch({ from: "/places" });
  const initialPlace = getPlace(search.place);
  const initialId = initialPlace.id;
  const [selectedId, setSelectedId] = useState(initialId);
  const [draftQuery, setDraftQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [visitTime, setVisitTime] = useState(initialPlace.time);
  const [notes, setNotes] = useState("");
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("middle");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const places = useMemo(createSamplePlaces, []);
  const selectedPlace = getPlace(selectedId);
  const saved = savedIds.has(selectedPlace.id);
  const results = FRIDAY_STOPS.filter((place) =>
    place.name.toLowerCase().includes(submittedQuery.trim().toLowerCase()),
  );

  function selectPlace(id: string): void {
    const nextPlace = getPlace(id);

    setSelectedId(id);
    setDraftQuery("");
    setSubmittedQuery("");
    setVisitTime(nextPlace.time);
    setNotes("");
    void navigate({ replace: true, search: { place: id }, to: "/places" });
  }

  function goBack(): void {
    if (canGoBack) {
      router.history.back();

      return;
    }

    void navigate({ replace: true, to: "/plan" });
  }

  function toggleSaved(): void {
    setSavedIds((current) => {
      const next = new Set(current);

      if (next.has(selectedPlace.id)) {
        next.delete(selectedPlace.id);
      } else {
        next.add(selectedPlace.id);
      }

      return next;
    });
  }

  function startSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;

    if (target.closest("button, a, input, textarea, summary") !== null) {
      return;
    }

    if (sheetSnap === "expanded" && target.closest(".place-sheet__drag-zone") === null) {
      return;
    }

    event.preventDefault();
    dragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startHandleDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    event.preventDefault();
    dragStartRef.current = event.clientY;
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
    const baseOffset = getSheetOffset(sheetSnap);
    const maximumOffset = getSheetOffset("collapsed");

    setDragOffset(Math.min(maximumOffset - baseOffset, Math.max(-baseOffset, delta)));
  }

  function finishSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    if (dragStartRef.current === null) {
      return;
    }

    const delta = event.clientY - dragStartRef.current;

    dragStartRef.current = null;
    setDragOffset(0);

    if (delta < -56) {
      setSheetSnap(sheetSnap === "collapsed" ? "middle" : "expanded");
    } else if (delta > 56) {
      setSheetSnap(sheetSnap === "expanded" ? "middle" : "collapsed");
    }
  }

  function cycleSheet(): void {
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
          onSelect={selectPlace}
          places={places}
          selectedId={selectedPlace.id}
          variant="discovery"
        />

        <div className="place-search">
          <button
            aria-label="Back to plan"
            className="place-search__back"
            onClick={goBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={22} strokeWidth={1.8} />
          </button>

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
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search places"
              value={draftQuery}
            />
            <button type="submit">Search</button>
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
        data-snap={sheetSnap}
        onPointerCancel={finishSheetDrag}
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
            onPointerCancel={finishHandleDrag}
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
          <div className="place-sheet__photos">
            <img alt={selectedPlace.name} src={selectedPlace.image} />
            <img alt={`${selectedPlace.name} surroundings`} src={selectedPlace.secondImage} />
          </div>

          <div className="place-sheet__actions">
            <button
              className="place-sheet__primary"
              onClick={() => setNotice("Add-to-day is not connected yet.")}
              type="button"
            >
              Add to Friday
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

          <details className="place-sheet__import">
            <summary>
              <Upload aria-hidden="true" size={19} strokeWidth={1.8} />
              Import places
            </summary>
            <p>Import support is planned for KML, KMZ and Google Maps lists.</p>
            <div aria-label="Planned import formats" className="place-sheet__formats">
              <span>KML</span>
              <span>KMZ</span>
              <span>Maps list</span>
            </div>
          </details>

          <p aria-live="polite" className="place-sheet__notice">
            {notice}
          </p>
        </div>
      </section>
    </main>
  );
}

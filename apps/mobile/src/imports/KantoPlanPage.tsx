import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Layers,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TripMap } from "../plan/TripMap";
import { PlaceCategoryIcon } from "../places/PlaceCategoryIcon";
import { effectivePlaceCategory, PLACE_CATEGORY_LABELS } from "../places/place-category";
import type { PlaceCollection } from "../plan/map-data";
import { VisitTime } from "../plan/VisitTime";
import {
  KANTO_DAYS,
  copyLegacyKantoVisits,
  loadImportedPlaces,
  loadImportedVisits,
  removeImportedVisit,
  saveImportedVisitDetails,
  moveImportedVisit,
  type ImportedVisit,
} from "./place-library";
import {
  loadCreatedTrips,
  setTripDayOption,
  tripDays,
  updateTrip,
  type CreatedTrip,
} from "../trips/trip-store";
import { displayImportedImageUrl, importedPlaceImages } from "./import-media";
import { loadOsmPhotoCache } from "./osm-photo";
import type { ImportedPoint } from "./parse-place-file";
import {
  loadItinerary,
  parseItinerarySheet,
  reconcileItineraryMatches,
  saveItinerary,
  type ItineraryEntry,
} from "./itinerary-sheet";
import "./kanto-plan.css";

function mappedPlaces(points: readonly ImportedPoint[]): PlaceCollection {
  const linkedPhotos = loadOsmPhotoCache();

  return {
    type: "FeatureCollection",
    features: points.map((point, index) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: {
        id: point.id,
        name: point.name,
        category: "Imported place",
        image: displayImportedImageUrl(
          importedPlaceImages(point)[0] ?? linkedPhotos[point.id]?.photo?.imageUrl,
        ),
        marker: `place-${index + 1}`,
        synthetic: false,
      },
    })),
  };
}

export function KantoPlanPage(): React.JSX.Element {
  const routeId = window.location.pathname.split("/").at(-1) ?? "kanto";
  const [trip, setTrip] = useState<CreatedTrip | undefined>(() =>
    loadCreatedTrips().find((item) => item.id === routeId),
  );
  const days: { day: string; label: string }[] =
    trip === undefined
      ? KANTO_DAYS.map((item) => ({ day: item.date, label: item.label }))
      : tripDays(trip);
  const [day, setDay] = useState<string>(days[0]?.day ?? "");
  const [points, setPoints] = useState<ImportedPoint[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryEntry[]>([]);
  const [variant, setVariant] = useState(trip?.dayOptions?.[days[0]?.day ?? ""] ?? "A");
  const [importingSheet, setImportingSheet] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [tripName, setTripName] = useState(trip?.name ?? "");
  const [tripStart, setTripStart] = useState(trip?.startDate ?? "");
  const [tripEnd, setTripEnd] = useState(trip?.endDate ?? "");
  const [showMap, setShowMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, { time: string; notes: string }>>({});

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadImportedPlaces(),
      loadImportedVisits(),
      loadItinerary(trip?.id ?? "kanto"),
    ])
      .then(([loadedPoints, loadedVisits, loadedItinerary]) => {
        if (active) {
          const reconciled = reconcileItineraryMatches(loadedItinerary, loadedPoints);
          setPoints(loadedPoints);
          setVisits(loadedVisits);
          setItinerary(reconciled);
          if (reconciled.length > 0) {
            setShowMap(true);
          }
          if (JSON.stringify(reconciled) !== JSON.stringify(loadedItinerary)) {
            void saveItinerary(trip?.id ?? "kanto", reconciled).catch(() => {
              if (active) {
                setError("New map pins were found, but their links could not be saved.");
              }
            });
          }
        }
      })
      .catch(() => {
        if (active) {
          setError("This trip could not be read from this device.");
        }
      });

    return () => {
      active = false;
    };
  }, [trip?.id]);

  const variants = useMemo(
    () => [
      ...new Set(itinerary.filter((entry) => entry.day === day).map((entry) => entry.variant)),
    ],
    [day, itinerary],
  );
  const activeVariant = variants.includes(variant) ? variant : (variants[0] ?? "A");
  const sheetEntries = useMemo(
    () =>
      itinerary
        .filter((entry) => entry.day === day && entry.variant === activeVariant)
        .sort((a, b) => a.order - b.order),
    [activeVariant, day, itinerary],
  );

  const stops = useMemo(
    () =>
      visits
        .filter((visit) => visit.day === day && visit.tripId === (trip?.id ?? undefined))
        .sort((a, b) => a.order - b.order)
        .flatMap((visit) => {
          const point = points.find((candidate) => candidate.id === visit.placeId);

          return point === undefined ? [] : [{ point, visit }];
        }),
    [day, points, trip?.id, visits],
  );
  const mapPlaces = useMemo(() => {
    const byId = new Map(points.map((point) => [point.id, point]));

    return mappedPlaces([
      ...sheetEntries.flatMap((entry) =>
        entry.placeId && byId.has(entry.placeId) ? [byId.get(entry.placeId)!] : [],
      ),
      ...stops.map(({ point }) => point),
    ]);
  }, [points, sheetEntries, stops]);
  const dayLabel = days.find((item) => item.day === day)?.label ?? day;
  const canRestoreLegacy =
    trip !== undefined &&
    /kanto/i.test(trip.name) &&
    trip.startDate === KANTO_DAYS[0].date &&
    trip.endDate === KANTO_DAYS.at(-1)?.date &&
    visits.some(
      (visit) =>
        visit.tripId === undefined &&
        KANTO_DAYS.some(({ date }) => date === visit.day) &&
        !visits.some(
          (candidate) =>
            candidate.tripId === trip.id &&
            candidate.day === visit.day &&
            candidate.placeId === visit.placeId,
        ),
    );

  async function restoreLegacy(): Promise<void> {
    if (trip === undefined) {
      return;
    }
    try {
      const count = await copyLegacyKantoVisits(trip.id);
      setVisits(await loadImportedVisits());
      setNotice(`${count} previous ${count === 1 ? "place" : "places"} copied into this trip.`);
    } catch {
      setError("Could not copy previous Kanto places.");
    }
  }

  async function toggleEditing(): Promise<void> {
    if (editing) {
      try {
        await saveItinerary(trip?.id ?? "kanto", itinerary);
      } catch {
        setError("Could not save itinerary changes.");

        return;
      }
    }
    setEdits(
      Object.fromEntries(
        visits.map((visit) => [visit.id, { time: visit.time, notes: visit.notes ?? "" }]),
      ),
    );
    setEditing((current) => !current);
  }

  async function saveDetails(visit: ImportedVisit): Promise<void> {
    const next = edits[visit.id];
    if (next === undefined) {
      return;
    }
    try {
      if (!(await saveImportedVisitDetails(visit.id, next.time, next.notes))) {
        setError("Enter a valid time and note.");

        return;
      }
      setVisits(await loadImportedVisits());
      setError("");
    } catch {
      setError("Could not save this visit.");
    }
  }

  async function move(visit: ImportedVisit, direction: -1 | 1): Promise<void> {
    try {
      if (await moveImportedVisit(visit.id, direction)) {
        setVisits(await loadImportedVisits());
      }
    } catch {
      setError("Could not reorder this day.");
    }
  }

  async function remove(point: ImportedPoint): Promise<void> {
    try {
      await removeImportedVisit(day, point.id, trip?.id);
      setVisits(await loadImportedVisits());
      if (selectedId === point.id) {
        setSelectedId(null);
      }
    } catch {
      setError("Could not remove this place.");
    }
  }

  async function importSheet(file: File | undefined): Promise<void> {
    if (trip === undefined || file === undefined) {
      return;
    }
    setImportingSheet(true);
    setError("");
    try {
      const entries = await parseItinerarySheet(file, trip.id, trip.startDate, points);
      if (entries.some((entry) => entry.day < trip.startDate || entry.day > trip.endDate)) {
        throw new Error("The spreadsheet has days outside this trip's date range.");
      }
      await saveItinerary(trip.id, entries);
      setItinerary(entries);
      if (!entries.some((entry) => entry.day === day && entry.variant === variant)) {
        setVariant("A");
        setTrip(setTripDayOption(trip.id, day, "A"));
      }
      setShowMap(true);
      const linked = entries.filter((entry) => entry.match === "matched").length;
      const review = entries.filter(
        (entry) => entry.kind === "place" && entry.match !== "matched",
      ).length;
      setNotice(
        `${entries.length} itinerary rows imported · ${linked} map pins linked · ${review} places need review.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import itinerary.");
    } finally {
      setImportingSheet(false);
    }
  }

  function saveTripDetails(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (trip === undefined) {
      return;
    }
    if (
      itinerary.some((entry) => entry.day < tripStart || entry.day > tripEnd) ||
      visits.some(
        (visit) => visit.tripId === trip.id && (visit.day < tripStart || visit.day > tripEnd),
      )
    ) {
      setError("The new dates would leave planned stops outside this trip.");

      return;
    }
    try {
      const updated = updateTrip(trip.id, tripName, tripStart, tripEnd);
      setTrip(updated);
      setDay((current) =>
        current < updated.startDate || current > updated.endDate ? updated.startDate : current,
      );
      setEditingTrip(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update trip.");
    }
  }

  function updateSheetEntry(
    id: string,
    changes: Partial<Pick<ItineraryEntry, "time" | "detail">>,
  ): void {
    setItinerary((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
    );
  }

  async function moveSheetEntry(id: string, direction: -1 | 1): Promise<void> {
    const index = sheetEntries.findIndex((entry) => entry.id === id);
    const neighbor = sheetEntries[index + direction];
    const selected = sheetEntries[index];
    if (selected === undefined || neighbor === undefined) {
      return;
    }
    const updated = itinerary.map((entry) => {
      if (entry.id === selected.id) {
        return { ...entry, order: neighbor.order };
      }
      if (entry.id === neighbor.id) {
        return { ...entry, order: selected.order };
      }

      return entry;
    });
    setItinerary(updated);
    try {
      await saveItinerary(trip?.id ?? "kanto", updated);
    } catch {
      setItinerary(itinerary);
      setError("Could not reorder this itinerary.");
    }
  }

  if (trip === undefined && routeId !== "kanto") {
    return (
      <section className="kanto-plan__missing">
        <h1>Trip not found</h1>
        <p>This trip is not saved on this device.</p>
        <Link to="/trips">Back to trips</Link>
      </section>
    );
  }

  return (
    <section className={`plan-page kanto-plan${showMap ? "" : " plan-page--plan-only"}`}>
      <header className="plan-header">
        <Link aria-label="Back to trips" className="plan-header__back" to="/trips">
          <ArrowLeft aria-hidden="true" size={22} />
        </Link>
        <div className="plan-header__title">
          <h1>{trip?.name ?? "Kanto trip"}</h1>
          <p>
            {trip === undefined
              ? "27 Sep–1 Oct 2026"
              : `${days[0]?.label ?? trip.startDate}–${days.at(-1)?.label ?? trip.endDate}`}
          </p>
        </div>
        {trip !== undefined ? (
          <button
            aria-label="Edit trip details"
            className="kanto-plan__edit-trip"
            onClick={() => {
              setTripName(trip.name);
              setTripStart(trip.startDate);
              setTripEnd(trip.endDate);
              setEditingTrip(true);
            }}
            type="button"
          >
            <Pencil aria-hidden="true" size={18} />
          </button>
        ) : null}
        <Link
          aria-label="Browse imported maps"
          className="kanto-plan__maps-link"
          to="/maps"
          search={{ trip: trip?.id ?? "kanto", day }}
        >
          <Layers aria-hidden="true" size={20} />
        </Link>
      </header>
      {editingTrip ? (
        <form className="kanto-plan__details-form" onSubmit={saveTripDetails}>
          <label>
            Trip name
            <input
              aria-label="Trip name"
              onChange={(event) => setTripName(event.target.value)}
              value={tripName}
            />
          </label>
          <label>
            Start date
            <input
              aria-label="Trip start date"
              onChange={(event) => setTripStart(event.target.value)}
              type="date"
              value={tripStart}
            />
          </label>
          <label>
            End date
            <input
              aria-label="Trip end date"
              onChange={(event) => setTripEnd(event.target.value)}
              type="date"
              value={tripEnd}
            />
          </label>
          <button type="submit">Save trip</button>
          <button onClick={() => setEditingTrip(false)} type="button">
            Cancel
          </button>
        </form>
      ) : null}
      <nav aria-label="Trip sections" className="trip-sections">
        <span aria-current="page" className="trip-sections__link trip-sections__link--active">
          Plan
        </span>
        <Link
          className="trip-sections__link"
          to="/maps"
          search={{ trip: trip?.id ?? "kanto", day }}
        >
          Maps
        </Link>
      </nav>
      <div aria-label="Trip days" className="day-strip" role="group">
        {days.map((item) => (
          <button
            aria-pressed={day === item.day}
            className={`day-strip__day${day === item.day ? " day-strip__day--selected" : ""}`}
            key={item.day}
            onClick={() => {
              setDay(item.day);
              const savedOption = trip?.dayOptions?.[item.day] ?? "A";
              setVariant(
                itinerary.some((entry) => entry.day === item.day && entry.variant === savedOption)
                  ? savedOption
                  : "A",
              );
              setSelectedId(null);
            }}
            type="button"
          >
            <span>{item.label.split(" ")[0]}</span>
            <strong>{item.label.split(" ")[1]}</strong>
          </button>
        ))}
      </div>
      {showMap ? (
        <TripMap
          frameKey={`${day}:${activeVariant}`}
          id="plan-map"
          places={mapPlaces}
          orderPlaces={mapPlaces}
          selectedId={selectedId}
          onSelect={setSelectedId}
          recenterLabel="Recenter on day places"
          variant="planner"
        />
      ) : null}
      <section className="day-plan">
        <header className="day-plan__header">
          <span className="day-plan__heading">
            <h2>{dayLabel}</h2>
          </span>
          <span className="day-plan__header-actions">
            <button
              aria-controls="plan-map"
              aria-label="Map view"
              aria-pressed={showMap}
              className="day-plan__view-toggle"
              onClick={() => setShowMap((value) => !value)}
              type="button"
            >
              <MapIcon aria-hidden="true" size={22} />
            </button>
            <button
              aria-label={editing ? "Done editing plan" : `Edit plan for ${dayLabel}`}
              aria-pressed={editing}
              className="day-plan__view-toggle"
              onClick={() => void toggleEditing()}
              type="button"
            >
              {editing ? (
                <Check aria-hidden="true" size={21} />
              ) : (
                <Pencil aria-hidden="true" size={21} />
              )}
            </button>
          </span>
        </header>
        {trip !== undefined ? (
          <label className="kanto-plan__sheet-upload">
            <Upload aria-hidden="true" size={18} />
            <span>
              {importingSheet
                ? "Importing itinerary…"
                : itinerary.length
                  ? "Replace itinerary spreadsheet"
                  : "Import itinerary spreadsheet"}
            </span>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Choose itinerary spreadsheet"
              disabled={importingSheet}
              onChange={(event) => {
                void importSheet(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
        ) : null}
        {variants.length > 1 ? (
          <div aria-label="Itinerary option" className="kanto-plan__variants" role="group">
            {variants.map((option) => (
              <button
                aria-pressed={activeVariant === option}
                key={option}
                onClick={() => {
                  setVariant(option);
                  if (trip !== undefined) {
                    try {
                      setTrip(setTripDayOption(trip.id, day, option));
                    } catch {
                      setError("Could not save the itinerary option.");
                    }
                  }
                }}
                type="button"
              >
                Option {option}
              </button>
            ))}
          </div>
        ) : null}
        {canRestoreLegacy ? (
          <div className="kanto-plan__legacy">
            <span>Previous Kanto day selections are available.</span>
            <button onClick={() => void restoreLegacy()} type="button">
              Copy to this trip
            </button>
          </div>
        ) : null}
        {notice ? (
          <p className="day-plan__storage-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="day-plan__storage-notice" role="alert">
            {error}
          </p>
        ) : null}
        {sheetEntries.length > 0 ? (
          <div aria-label={`${dayLabel} imported itinerary`} className="kanto-plan__sheet-entries">
            {sheetEntries.map((entry, index) => (
              <article
                className={`kanto-plan__sheet-entry kanto-plan__sheet-entry--${entry.kind}`}
                key={entry.id}
              >
                <span className="kanto-plan__sheet-time">{entry.time || "·"}</span>
                <span className="kanto-plan__sheet-marker">
                  <MapPin aria-hidden="true" size={17} />
                </span>
                <span className="kanto-plan__sheet-copy">
                  {entry.placeId && !editing ? (
                    <Link
                      onClick={() => setSelectedId(entry.placeId ?? null)}
                      search={{ trip: trip?.id ?? "kanto", day, place: entry.placeId }}
                      to="/maps"
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <strong>{entry.title}</strong>
                  )}
                  <small>{[entry.area, entry.detail].filter(Boolean).join(" · ")}</small>
                  {entry.kind === "place" && entry.match !== "matched" ? (
                    <em>
                      {entry.match === "ambiguous"
                        ? "Multiple map pins — review needed"
                        : "No matching map pin yet"}
                    </em>
                  ) : null}
                  {editing ? (
                    <span className="kanto-plan__sheet-edit">
                      <input
                        aria-label={`Time for ${entry.title}`}
                        onChange={(event) =>
                          updateSheetEntry(entry.id, { time: event.target.value })
                        }
                        placeholder="Time"
                        value={entry.time}
                      />
                      <input
                        aria-label={`Note for ${entry.title}`}
                        onChange={(event) =>
                          updateSheetEntry(entry.id, { detail: event.target.value })
                        }
                        placeholder="Note"
                        value={entry.detail}
                      />
                      <button
                        aria-label={`Move ${entry.title} earlier`}
                        disabled={index === 0}
                        onClick={() => void moveSheetEntry(entry.id, -1)}
                        type="button"
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        aria-label={`Move ${entry.title} later`}
                        disabled={index === sheetEntries.length - 1}
                        onClick={() => void moveSheetEntry(entry.id, 1)}
                        type="button"
                      >
                        <ArrowDown size={17} />
                      </button>
                    </span>
                  ) : null}
                </span>
              </article>
            ))}
          </div>
        ) : null}
        {stops.length ? (
          <div aria-label={`${dayLabel} itinerary`} className="timeline">
            {stops.map(({ point, visit }, index) => (
              <div className="timeline__entry" key={point.id}>
                <div className="timeline__surface timeline__surface--plan">
                  <div className="timeline__stop kanto-plan__stop">
                    <VisitTime className="timeline__time" time={visit.time} />
                    <span
                      className={`timeline__icon timeline__icon--${effectivePlaceCategory(point)}`}
                    >
                      <PlaceCategoryIcon category={effectivePlaceCategory(point)} />
                    </span>
                    <span className="timeline__info">
                      <strong>{point.name}</strong>
                      <span>
                        {point.folder} · {PLACE_CATEGORY_LABELS[effectivePlaceCategory(point)]}
                      </span>
                    </span>
                    <button
                      aria-label={`Remove ${point.name} from ${dayLabel}`}
                      className="kanto-plan__remove"
                      onClick={() => void remove(point)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={19} />
                    </button>
                  </div>
                  {visit.notes ? <p className="kanto-plan__note">{visit.notes}</p> : null}
                  {editing ? (
                    <div className="kanto-plan__edit-row">
                      <label>
                        Time
                        <input
                          aria-label={`Time for ${point.name}`}
                          type="time"
                          value={edits[visit.id]?.time ?? visit.time}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [visit.id]: {
                                time: event.target.value,
                                notes: current[visit.id]?.notes ?? visit.notes ?? "",
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Note
                        <input
                          aria-label={`Note for ${point.name}`}
                          maxLength={5000}
                          value={edits[visit.id]?.notes ?? visit.notes ?? ""}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [visit.id]: {
                                time: current[visit.id]?.time ?? visit.time,
                                notes: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <button
                        aria-label={`Save ${point.name}`}
                        onClick={() => void saveDetails(visit)}
                        type="button"
                      >
                        <Check aria-hidden="true" size={19} />
                      </button>
                      <button
                        aria-label={`Move ${point.name} earlier`}
                        disabled={index === 0}
                        onClick={() => void move(visit, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" size={18} />
                      </button>
                      <button
                        aria-label={`Move ${point.name} later`}
                        disabled={index === stops.length - 1}
                        onClick={() => void move(visit, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" size={18} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : sheetEntries.length === 0 ? (
          <div className="day-plan__empty">
            <MapPin aria-hidden="true" size={26} />
            <h3>A day to make your own</h3>
            <p>Add a place from your imported maps.</p>
          </div>
        ) : null}
        <Link
          aria-label={`Add a place to ${dayLabel}`}
          className="day-plan__add kanto-plan__add"
          to="/maps"
          search={{ trip: trip?.id ?? "kanto", day }}
        >
          <Plus aria-hidden="true" size={28} />
        </Link>
        <Link className="kanto-plan__import" to="/maps" search={{ trip: trip?.id ?? "kanto", day }}>
          Browse or import maps
        </Link>
      </section>
    </section>
  );
}

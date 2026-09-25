import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Landmark,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadImportedPlaces,
  loadImportedVisits,
  copyLegacyVisitsToTrip,
  removeImportedVisit,
  restoreImportedVisit,
  saveImportedVisitDetails,
  type ImportedVisit,
} from "../imports/place-library";
import { importedPointAsStop } from "../imports/imported-stop";
import {
  loadItinerary,
  parseItinerarySheet,
  reconcileItineraryMatches,
  saveItinerary,
  type ItineraryEntry,
} from "../imports/itinerary-sheet";
import type { ImportedPoint } from "../imports/parse-place-file";
import {
  loadCreatedTrips,
  clearTripRowOrder,
  setTripDayOption,
  setTripRowOrder,
  tripDays,
  updateTrip,
  type CreatedTrip,
} from "../trips/trip-store";
import type { PlaceCollection } from "./map-data";
import { PlanWorkspace } from "./PlanWorkspace";
import { PlanTimelineRow } from "./PlanTimelineRow";
import { usePlanStopSwipe } from "./usePlanStopSwipe";
import "./stop-actions.css";

interface PlanRow {
  id: string;
  title: string;
  time: string;
  detail: string;
  area: string;
  kind: "place" | "transport" | "note";
  point?: ImportedPoint | undefined;
  entry?: ItineraryEntry;
  visit?: ImportedVisit;
}

interface RemovedPlanRow {
  day: string;
  entry?: ItineraryEntry;
  visit?: ImportedVisit;
}

function dayHeading(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function startTime(label: string): string {
  const matched = /(?:^|\D)([01]?\d|2[0-3])[.:]([0-5]\d)/.exec(label);

  return matched ? `${matched[1]!.padStart(2, "0")}:${matched[2]}` : label.slice(0, 8);
}

function mapPlaces(rows: readonly PlanRow[]): PlaceCollection {
  return {
    type: "FeatureCollection",
    features: rows.flatMap((row, index) => {
      const point = row.point;
      if (!point) {
        return [];
      }
      const stop = importedPointAsStop(point);

      return [
        {
          type: "Feature" as const,
          id: point.id,
          geometry: {
            type: "Point" as const,
            coordinates: [point.longitude, point.latitude],
          },
          properties: {
            id: point.id,
            name: point.name,
            category: stop.category,
            image: stop.image,
            marker: `place-${index + 1}`,
            synthetic: false,
          },
        },
      ];
    }),
  };
}

export function TripPlanPage(): React.JSX.Element {
  const { tripId } = useParams({ from: "/mobile-shell/plan/trip/$tripId" });
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/plan/trip/$tripId" });
  const [trip, setTrip] = useState<CreatedTrip | undefined>(() =>
    loadCreatedTrips().find((item) => item.id === tripId),
  );
  const [points, setPoints] = useState<ImportedPoint[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryEntry[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stopSwipe = usePlanStopSwipe();
  const [editing, setEditing] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [tripName, setTripName] = useState(trip?.name ?? "");
  const [tripStart, setTripStart] = useState(trip?.startDate ?? "");
  const [tripEnd, setTripEnd] = useState(trip?.endDate ?? "");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removedRows, setRemovedRows] = useState<RemovedPlanRow[]>([]);
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip]);
  const day = days.some((item) => item.day === search.day) ? search.day! : (days[0]?.day ?? "");
  const variants = useMemo(
    () => [
      ...new Set(itinerary.filter((entry) => entry.day === day).map((entry) => entry.variant)),
    ],
    [day, itinerary],
  );
  const savedOption = trip?.dayOptions?.[day] ?? "A";
  const variant = variants.includes(savedOption) ? savedOption : (variants[0] ?? "A");
  const rowOrder = trip?.rowOrder?.[`${day}:${variant}`];
  const mapExpanded = search.map === "full";
  const mapVisible = showMap || mapExpanded;
  const mapOpenedHereRef = useRef(false);

  useEffect(() => {
    if (!mapExpanded) {
      mapOpenedHereRef.current = false;
    }
  }, [mapExpanded]);

  function changeMapExpanded(expanded: boolean): void {
    stopSwipe.close();
    if (expanded) {
      mapOpenedHereRef.current = true;
      void navigate({
        to: "/plan/trip/$tripId",
        params: { tripId },
        search: { day, map: "full" },
        resetScroll: false,
      });
    } else if (mapOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/plan/trip/$tripId",
        params: { tripId },
        search: { day },
        replace: true,
        resetScroll: false,
      });
    }
  }

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const [loadedPoints, loadedVisits, loadedEntries] = await Promise.all([
          loadImportedPlaces(),
          loadImportedVisits(),
          loadItinerary(tripId),
        ]);
        if (!active) {
          return;
        }
        const reconciled = reconcileItineraryMatches(loadedEntries, loadedPoints);
        setPoints(loadedPoints);
        setVisits(loadedVisits);
        setItinerary(reconciled);
        if (JSON.stringify(reconciled) !== JSON.stringify(loadedEntries)) {
          void saveItinerary(tripId, reconciled);
        }
      } catch {
        if (active) {
          setError("Could not load this trip from device storage.");
        }
      }
    }
    void load();

    return () => {
      active = false;
    };
  }, [tripId]);

  const byId = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const rows = useMemo<PlanRow[]>(() => {
    const sheetRows = itinerary
      .filter((entry) => entry.day === day && entry.variant === variant)
      .sort((left, right) => left.order - right.order)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        time: entry.time,
        detail: entry.detail,
        area: entry.area,
        kind: entry.kind,
        point: entry.placeId ? byId.get(entry.placeId) : undefined,
        entry,
      }));
    const addedRows = visits
      .filter((visit) => visit.tripId === tripId && visit.day === day)
      .sort((left, right) => left.order - right.order)
      .flatMap((visit) => {
        const point = byId.get(visit.placeId);

        return point
          ? [
              {
                id: visit.id,
                title: point.name,
                time: visit.time,
                detail: visit.notes ?? "",
                area: point.folder,
                kind: "place" as const,
                point,
                visit,
              },
            ]
          : [];
      });

    const combined = [...sheetRows, ...addedRows];
    if (!Array.isArray(rowOrder) || rowOrder.length === 0) {
      return combined;
    }
    const ranks = new Map(rowOrder.map((id, index) => [id, index]));

    return combined.sort((left, right) => {
      const leftRank = ranks.get(left.id);
      const rightRank = ranks.get(right.id);
      if (leftRank === undefined) {
        return rightRank === undefined ? 0 : 1;
      }

      return rightRank === undefined ? -1 : leftRank - rightRank;
    });
  }, [byId, day, itinerary, rowOrder, tripId, variant, visits]);
  const places = useMemo(() => mapPlaces(rows), [rows]);
  const legacyCount = visits.filter(
    (visit) =>
      visit.tripId === undefined &&
      days.some(({ day: knownDay }) => knownDay === visit.day) &&
      !visits.some(
        (current) =>
          current.tripId === tripId &&
          current.day === visit.day &&
          current.placeId === visit.placeId,
      ),
  ).length;

  async function importSheet(file: File | undefined): Promise<void> {
    if (!file || !trip) {
      return;
    }
    setImporting(true);
    setError("");
    try {
      const imported = await parseItinerarySheet(file, trip.id, trip.startDate, points);
      if (imported.some((entry) => entry.day < trip.startDate || entry.day > trip.endDate)) {
        throw new Error("The spreadsheet has days outside this trip.");
      }
      await saveItinerary(trip.id, imported);
      setItinerary(imported);
      setTrip(clearTripRowOrder(trip.id));
      setRemovedRows([]);
      const linked = imported.filter((entry) => entry.match === "matched").length;
      const review = imported.filter(
        (entry) => entry.kind === "place" && entry.match !== "matched",
      ).length;
      setMessage(
        `${imported.length} itinerary rows imported · ${linked} map pins linked · ${review} places need review.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this spreadsheet.");
    } finally {
      setImporting(false);
    }
  }

  async function saveRows(next: ItineraryEntry[]): Promise<boolean> {
    try {
      await saveItinerary(tripId, next);
      setItinerary(next);
      setError("");

      return true;
    } catch {
      setError("Could not save itinerary changes.");

      return false;
    }
  }

  async function removeRow(row: PlanRow): Promise<void> {
    const entry = row.entry;
    const visit = row.visit;
    if (entry) {
      if (await saveRows(itinerary.filter((entry) => entry.id !== row.id))) {
        setRemovedRows((current) => [...current, { day, entry }]);
      }
    } else if (visit?.placeId) {
      try {
        await removeImportedVisit(day, visit.placeId, tripId);
        setVisits(await loadImportedVisits());
        setRemovedRows((current) => [...current, { day, visit }]);
      } catch {
        setError("Could not remove this place.");
      }
    }
  }

  async function undoRemoval(): Promise<void> {
    if (removedRows.length === 0) {
      return;
    }
    const entries = removedRows.flatMap((removed) => (removed.entry ? [removed.entry] : []));
    const missingEntries = entries.filter(
      (entry) => !itinerary.some((current) => current.id === entry.id),
    );
    if (missingEntries.length > 0 && !(await saveRows([...itinerary, ...missingEntries]))) {
      return;
    }
    try {
      for (const removed of removedRows) {
        if (removed.visit) {
          await restoreImportedVisit(removed.visit);
        }
      }
      if (removedRows.some((removed) => removed.visit)) {
        setVisits(await loadImportedVisits());
      }
    } catch {
      setError("Could not restore this place.");

      return;
    }
    setRemovedRows([]);
  }

  async function saveRowDetails(row: PlanRow, time: string, detail: string): Promise<void> {
    if (row.entry) {
      await saveRows(
        itinerary.map((entry) =>
          entry.id === row.id
            ? { ...entry, time: time.slice(0, 80), detail: detail.slice(0, 1500) }
            : entry,
        ),
      );
    } else if (row.visit) {
      try {
        if (!(await saveImportedVisitDetails(row.visit.id, time, detail))) {
          setError("Use a time such as 14:30 and a note under 5,000 characters.");

          return;
        }
        setVisits(await loadImportedVisits());
      } catch {
        setError("Could not save this place.");
      }
    }
  }

  function moveRow(row: PlanRow, direction: -1 | 1): void {
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    if (index < 0 || !rows[index + direction]) {
      return;
    }
    const orderedIds = rows.map((candidate) => candidate.id);
    [orderedIds[index], orderedIds[index + direction]] = [
      orderedIds[index + direction]!,
      orderedIds[index]!,
    ];
    try {
      setTrip(setTripRowOrder(tripId, day, variant, orderedIds));
      setError("");
    } catch {
      setError("Could not reorder this day.");
    }
  }

  function saveTripDetails(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      itinerary.some((entry) => entry.day < tripStart || entry.day > tripEnd) ||
      visits.some(
        (visit) => visit.tripId === tripId && (visit.day < tripStart || visit.day > tripEnd),
      )
    ) {
      setError("The new dates would leave planned stops outside this trip.");

      return;
    }
    try {
      setTrip(updateTrip(tripId, tripName, tripStart, tripEnd));
      setEditingTrip(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update trip.");
    }
  }

  if (!trip) {
    return (
      <section className="day-plan__empty">
        <h1>Trip not found</h1>
        <p>This trip is not saved on this device.</p>
        <Link to="/trips">Back to trips</Link>
      </section>
    );
  }

  return (
    <PlanWorkspace
      trip={trip}
      onEditTrip={() => setEditingTrip((current) => !current)}
      className="trip-plan"
      days={days.map((item) => {
        const date = new Date(`${item.day}T12:00:00Z`);

        return {
          id: item.day,
          weekday: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
            date,
          ),
          date: date.getUTCDate(),
          label: dayHeading(item.day),
        };
      })}
      selectedDay={day}
      onDayChange={(next) => {
        stopSwipe.close();
        setSelectedId(null);
        void navigate({
          to: "/plan/trip/$tripId",
          params: { tripId },
          search: { day: next },
          replace: true,
          resetScroll: false,
        });
      }}
      mapVisible={mapVisible}
      mapExpanded={mapExpanded}
      onMapExpandedChange={changeMapExpanded}
      onMapSelect={setSelectedId}
      orderPlaces={places}
      places={places}
      selectedPlaceId={selectedId}
      overlay={
        removedRows.length > 0 ? (
          <div aria-hidden={mapExpanded} className="plan-undo" inert={mapExpanded}>
            <span>
              <strong>
                {removedRows.length} {removedRows.length === 1 ? "place" : "places"} removed
              </strong>
              {removedRows.every((removed) => removed.day === removedRows[0]?.day)
                ? `From ${dayHeading(removedRows[0]!.day)}`
                : "From your trip plan"}
            </span>
            <button onClick={() => void undoRemoval()} type="button">
              Undo
            </button>
            <button
              aria-label="Dismiss removal message"
              onClick={() => setRemovedRows([])}
              type="button"
            >
              <X aria-hidden="true" size={18} strokeWidth={1.8} />
            </button>
          </div>
        ) : null
      }
    >
      <header className="day-plan__header">
        <span className="day-plan__heading">
          <h2>{dayHeading(day)}</h2>
        </span>
        <span className="day-plan__header-actions">
          <button
            aria-controls="plan-map"
            aria-label="Map view"
            aria-pressed={mapVisible}
            className="day-plan__view-toggle"
            onClick={() => setShowMap((current) => !current)}
            type="button"
          >
            <MapIcon aria-hidden="true" size={22} strokeWidth={1.8} />
          </button>
          <button
            aria-label={editing ? "Done editing plan" : "Edit plan"}
            aria-pressed={editing}
            className="day-plan__select-toggle"
            onClick={() => setEditing((current) => !current)}
            type="button"
          >
            <span className="day-plan__edit-icon">
              <Pencil aria-hidden="true" size={21} strokeWidth={1.8} />
            </span>
          </button>
        </span>
      </header>
      {editingTrip ? (
        <form className="trip-plan__details-form" onSubmit={saveTripDetails}>
          <label>
            Destination{" "}
            <input
              aria-label="Trip destination"
              maxLength={120}
              onChange={(event) => setTripName(event.target.value)}
              required
              value={tripName}
            />
          </label>
          <label>
            Start date{" "}
            <input
              aria-label="Trip start date"
              onChange={(event) => setTripStart(event.target.value)}
              required
              type="date"
              value={tripStart}
            />
          </label>
          <label>
            End date{" "}
            <input
              aria-label="Trip end date"
              onChange={(event) => setTripEnd(event.target.value)}
              required
              type="date"
              value={tripEnd}
            />
          </label>
          <button type="submit">Save trip</button>
        </form>
      ) : null}
      {legacyCount > 0 ? (
        <div className="trip-plan__legacy">
          <span>
            {legacyCount} unassigned map {legacyCount === 1 ? "place" : "places"} on these dates
          </span>
          <button
            onClick={() => {
              void copyLegacyVisitsToTrip(
                tripId,
                days.map((item) => item.day),
              )
                .then(async (count) => {
                  setVisits(await loadImportedVisits());
                  setMessage(`${count} ${count === 1 ? "place" : "places"} copied to this trip.`);
                })
                .catch(() => setError("Could not copy previous map selections."));
            }}
            type="button"
          >
            Copy to this trip
          </button>
        </div>
      ) : null}
      {variants.length > 1 ? (
        <div aria-label="Itinerary option" className="trip-plan__options" role="group">
          {variants.map((option) => (
            <button
              aria-pressed={variant === option}
              key={option}
              onClick={() => {
                try {
                  setTrip(setTripDayOption(tripId, day, option));
                } catch {
                  setError("Could not save itinerary option.");
                }
              }}
              type="button"
            >
              Option {option}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {rows.length ? (
        <div aria-label={`${dayHeading(day)} itinerary`} className="timeline">
          {rows.map((row, index) => {
            const stop = row.point ? importedPointAsStop(row.point, row.time) : null;
            const swipeOpen = stopSwipe.openId === row.id;

            return (
              <PlanTimelineRow
                category={stop?.category ?? "unknown"}
                id={row.id}
                image={stop?.image}
                key={row.id}
                onOpen={() => {
                  if (stopSwipe.clickSuppressed()) {
                    return;
                  }
                  if (swipeOpen) {
                    stopSwipe.close();

                    return;
                  }
                  const point = row.point;
                  if (editing || !point) {
                    return;
                  }
                  void navigate({ to: "/maps", search: { trip: tripId, day, place: point.id } });
                }}
                onRemove={() => {
                  stopSwipe.close();
                  void removeRow(row);
                }}
                removeLabel={`Remove ${row.title} from ${dayHeading(day)}`}
                selected={row.point?.id === selectedId}
                subtitle={
                  stop
                    ? `${stop.type} · ${row.area}`
                    : `${row.kind} · ${row.area || "Not linked to a map pin"}`
                }
                time={startTime(row.time)}
                title={row.title}
                swipe={{
                  open: swipeOpen,
                  offset: stopSwipe.offset,
                  onStart: (event) => stopSwipe.start(event, row.id),
                  onMove: stopSwipe.move,
                  onEnd: stopSwipe.end,
                  onCancel: stopSwipe.clear,
                }}
                travel={
                  index < rows.length - 1 && row.point && rows[index + 1]?.point
                    ? "Route not calculated yet"
                    : undefined
                }
              >
                {row.detail ? <p className="trip-plan__detail">{row.detail}</p> : null}
                {editing ? (
                  <form
                    className="trip-plan__edit-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      const time = values.get("time");
                      const note = values.get("note");
                      void saveRowDetails(
                        row,
                        typeof time === "string" ? time : "",
                        typeof note === "string" ? note : "",
                      );
                    }}
                  >
                    <label>
                      Time{" "}
                      <input
                        aria-label={`Time for ${row.title}`}
                        defaultValue={row.time}
                        maxLength={80}
                        name="time"
                      />
                    </label>
                    <label>
                      Note{" "}
                      <input
                        aria-label={`Note for ${row.title}`}
                        defaultValue={row.detail}
                        maxLength={row.entry ? 1500 : 5000}
                        name="note"
                      />
                    </label>
                    <button
                      aria-label={`Move ${row.title} up`}
                      onClick={() => moveRow(row, -1)}
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" size={17} />
                    </button>
                    <button
                      aria-label={`Move ${row.title} down`}
                      onClick={() => moveRow(row, 1)}
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" size={17} />
                    </button>
                    <button
                      onClick={() => void removeRow(row)}
                      type="button"
                      aria-label={`Remove ${row.title}`}
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                    <button type="submit">Save {row.title}</button>
                  </form>
                ) : null}
              </PlanTimelineRow>
            );
          })}
        </div>
      ) : (
        <div className="day-plan__empty">
          <Landmark aria-hidden="true" size={26} strokeWidth={1.7} />
          <h3>A day to make your own</h3>
          <p>Add your first place when you are ready.</p>
        </div>
      )}
      {editing || itinerary.length === 0 ? (
        <label className="trip-plan__upload">
          <Upload aria-hidden="true" size={18} />{" "}
          {importing
            ? "Importing itinerary…"
            : itinerary.length
              ? "Replace itinerary spreadsheet"
              : "Import itinerary spreadsheet"}
          <input
            aria-label="Choose itinerary spreadsheet"
            accept=".xlsx"
            disabled={importing}
            onChange={(event) => {
              void importSheet(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}
      <button
        className="day-plan__browse-maps"
        onClick={() => void navigate({ to: "/maps", search: { trip: tripId, day } })}
        type="button"
      >
        Browse imported maps
      </button>
      {stopSwipe.openId === null && removedRows.length === 0 ? (
        <button
          aria-label={`Add a place to ${dayHeading(day)}`}
          className="floating-add-button"
          onClick={() => void navigate({ to: "/maps", search: { trip: tripId, day } })}
          type="button"
        >
          <Plus aria-hidden="true" size={28} strokeWidth={1.9} />
        </button>
      ) : null}
    </PlanWorkspace>
  );
}

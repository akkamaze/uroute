import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useAccount } from "@uroute/auth/useAccount";
import { Landmark, Map as MapIcon, Pencil, Plus, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadImportedPlaces,
  loadImportedVisits,
  copyLegacyVisitsToTrip,
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
import { captureNavigationSnapshot } from "../navigation/swipe-back";
import {
  loadCreatedTrips,
  clearTripRowOrder,
  setTripDayOption,
  setTripPlanRows,
  tripDays,
  updateTrip,
  type CreatedTrip,
} from "../trips/trip-store";
import type { PlaceCollection } from "./map-data";
import { buildCreatedPlanRows, startTime, type CreatedPlanRow } from "./created-plan-rows";
import { PlanWorkspace } from "./PlanWorkspace";
import { PlanTimelineRow } from "./PlanTimelineRow";
import {
  accountPlanItinerary,
  accountPlanPoints,
  loadAccountPlanDay,
  loadAccountTrip,
  saveAccountPlanDay,
  updateAccountTrip,
  type AccountPlanEntry,
  type AccountTrip,
} from "./account-plan";
import { usePlanStopSwipe } from "./usePlanStopSwipe";
import "./stop-actions.css";

interface RemovedPlanRow {
  day: string;
  option: string;
  orderedIds: string[];
  hiddenIds: string[];
}

function dayHeading(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function mapPlaces(rows: readonly CreatedPlanRow[]): PlaceCollection {
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
  const account = useAccount();
  const accountUserId = account.user?.id;
  const [accountTripChecked, setAccountTripChecked] = useState(false);
  const [remoteTrip, setRemoteTrip] = useState<AccountTrip | null>(null);
  const [remoteEntries, setRemoteEntries] = useState<AccountPlanEntry[]>([]);
  const [remoteVersion, setRemoteVersion] = useState("");
  const [trip, setTrip] = useState<CreatedTrip | undefined>(() =>
    loadCreatedTrips().find((item) => item.id === tripId),
  );
  const [points, setPoints] = useState<ImportedPoint[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryEntry[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stopSwipe = usePlanStopSwipe();
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
  const rowHidden = trip?.rowHidden?.[`${day}:${variant}`];
  const rowEdits = trip?.rowEdits?.[`${day}:${variant}`];
  const mapExpanded = search.map === "full";
  const mapVisible = showMap || mapExpanded;
  const mapOpenedHereRef = useRef(false);

  useEffect(() => {
    setAccountTripChecked(false);
    if (!accountUserId) {
      setAccountTripChecked(true);

      return;
    }
    let active = true;
    void loadAccountTrip(tripId)
      .then((loaded) => {
        if (!active) {
          return;
        }
        setRemoteTrip(loaded);
        setTrip(loaded);
        setTripName(loaded.name);
        setTripStart(loaded.startDate);
        setTripEnd(loaded.endDate);
        setAccountTripChecked(true);
      })
      .catch(() => {
        // Existing device-only trips remain usable when they have no account copy.
        if (active) {
          setAccountTripChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId, tripId]);

  useEffect(() => {
    if (!remoteTrip || !day) {
      return;
    }
    let active = true;
    void loadAccountPlanDay(tripId, day)
      .then((loaded) => {
        if (!active) {
          return;
        }
        setRemoteVersion(loaded.version);
        setRemoteEntries(loaded.entries);
        setPoints(accountPlanPoints(loaded.entries));
        setItinerary(accountPlanItinerary(tripId, loaded.entries));
        setVisits([]);
        setError("");
      })
      .catch(() => {
        if (active) {
          setError("Could not load this plan from your account.");
        }
      });

    return () => {
      active = false;
    };
  }, [remoteTrip, tripId, day]);

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
    if (remoteTrip) {
      return;
    }
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
  }, [tripId, remoteTrip]);

  const rows = useMemo(
    () =>
      buildCreatedPlanRows(
        tripId,
        day,
        variant,
        points,
        itinerary,
        visits,
        rowOrder,
        rowHidden,
        rowEdits,
      ),
    [day, itinerary, points, rowEdits, rowHidden, rowOrder, tripId, variant, visits],
  );
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
    if (remoteTrip) {
      setError("Account trip spreadsheet import is not available yet.");

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

  async function removeRow(row: CreatedPlanRow): Promise<void> {
    if (remoteTrip) {
      try {
        const next = remoteEntries.filter((entry) => entry.sourceKey !== row.id);
        const saved = await saveAccountPlanDay(tripId, day, remoteVersion, next);
        setRemoteVersion(saved.version);
        setRemoteEntries(saved.entries);
        setItinerary(accountPlanItinerary(tripId, saved.entries));
        setPoints(accountPlanPoints(saved.entries));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not remove this place.");
      }

      return;
    }
    try {
      setTrip(
        setTripPlanRows(
          tripId,
          day,
          variant,
          rows.filter((candidate) => candidate.id !== row.id).map((candidate) => candidate.id),
          [...(rowHidden ?? []), row.id],
        ),
      );
      setRemovedRows((current) => [
        ...current,
        {
          day,
          option: variant,
          orderedIds: rows.map((candidate) => candidate.id),
          hiddenIds: [...(rowHidden ?? [])],
        },
      ]);
      setError("");
    } catch {
      setError("Could not remove this place.");
    }
  }

  function undoRemoval(): void {
    if (removedRows.length === 0) {
      return;
    }
    try {
      for (const removed of [...removedRows].reverse()) {
        setTrip(
          setTripPlanRows(
            tripId,
            removed.day,
            removed.option,
            removed.orderedIds,
            removed.hiddenIds,
          ),
        );
      }
    } catch {
      setError("Could not restore this place.");

      return;
    }
    setRemovedRows([]);
  }

  async function saveTripDetails(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
      if (remoteTrip) {
        const saved = await updateAccountTrip(remoteTrip, {
          name: tripName,
          startDate: tripStart,
          endDate: tripEnd,
        });
        setRemoteTrip(saved);
        setTrip(saved);
      } else {
        setTrip(updateTrip(tripId, tripName, tripStart, tripEnd));
      }
      setEditingTrip(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update trip.");
    }
  }

  if (!trip) {
    if (account.loading || !accountTripChecked) {
      return (
        <section className="day-plan__empty" role="status">
          Loading plan…
        </section>
      );
    }

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
            <button onClick={undoRemoval} type="button">
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
            aria-label={`Edit plan for ${dayHeading(day)}`}
            className="day-plan__select-toggle"
            onClick={() => {
              stopSwipe.close();
              captureNavigationSnapshot("/plan/edit");
              void navigate({
                to: "/plan/edit",
                search: { tripId, date: day, option: variant },
                state: (current) => ({ ...current, editPlanEntry: true }),
              });
            }}
            type="button"
          >
            <span className="day-plan__edit-icon">
              <Pencil aria-hidden="true" size={21} strokeWidth={1.8} />
            </span>
          </button>
        </span>
      </header>
      {editingTrip ? (
        <form className="trip-plan__details-form" onSubmit={(event) => void saveTripDetails(event)}>
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
                  setTrip(
                    remoteTrip
                      ? { ...trip, dayOptions: { ...trip.dayOptions, [day]: option } }
                      : setTripDayOption(tripId, day, option),
                  );
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
                  if (!point) {
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
                time={startTime(row.time) || row.time.slice(0, 8)}
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
      {!remoteTrip && itinerary.length === 0 ? (
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

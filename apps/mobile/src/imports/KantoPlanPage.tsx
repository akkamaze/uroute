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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { TripMap } from "../plan/TripMap";
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
import { loadCreatedTrips, tripDays } from "../trips/trip-store";
import type { ImportedPoint } from "./parse-place-file";
import "./kanto-plan.css";

function mappedPlaces(points: readonly ImportedPoint[]): PlaceCollection {
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
        marker: `place-${index + 1}`,
        synthetic: false,
      },
    })),
  };
}

export function KantoPlanPage(): React.JSX.Element {
  const routeId = window.location.pathname.split("/").at(-1) ?? "kanto";
  const trip = loadCreatedTrips().find((item) => item.id === routeId);
  const days: { day: string; label: string }[] =
    trip === undefined
      ? KANTO_DAYS.map((item) => ({ day: item.date, label: item.label }))
      : tripDays(trip);
  const [day, setDay] = useState<string>(days[0]?.day ?? "");
  const [points, setPoints] = useState<ImportedPoint[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, { time: string; notes: string }>>({});

  useEffect(() => {
    let active = true;
    void Promise.all([loadImportedPlaces(), loadImportedVisits()])
      .then(([loadedPoints, loadedVisits]) => {
        if (active) {
          setPoints(loadedPoints);
          setVisits(loadedVisits);
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
  }, []);

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
  const mapPlaces = useMemo(() => mappedPlaces(stops.map(({ point }) => point)), [stops]);
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
    if (trip === undefined) {return;}
    try {
      const count = await copyLegacyKantoVisits(trip.id);
      setVisits(await loadImportedVisits());
      setNotice(`${count} previous ${count === 1 ? "place" : "places"} copied into this trip.`);
    } catch {
      setError("Could not copy previous Kanto places.");
    }
  }

  function toggleEditing(): void {
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
        <Link
          aria-label="Browse imported maps"
          className="kanto-plan__maps-link"
          to="/maps"
          search={{ trip: trip?.id ?? "kanto", day }}
        >
          <Layers aria-hidden="true" size={20} />
        </Link>
      </header>
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
          id="plan-map"
          places={mapPlaces}
          orderPlaces={mapPlaces}
          selectedId={selectedId}
          onSelect={setSelectedId}
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
              onClick={toggleEditing}
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
        {stops.length ? (
          <div aria-label={`${dayLabel} itinerary`} className="timeline">
            {stops.map(({ point, visit }, index) => (
              <div className="timeline__entry" key={point.id}>
                <div className="timeline__surface timeline__surface--plan">
                  <div className="timeline__stop kanto-plan__stop">
                    <VisitTime className="timeline__time" time={visit.time} />
                    <span className="timeline__icon timeline__icon--temple">
                      <MapPin aria-hidden="true" size={22} />
                    </span>
                    <span className="timeline__info">
                      <strong>{point.name}</strong>
                      <span>{point.folder} · Imported place</span>
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
        ) : (
          <div className="day-plan__empty">
            <MapPin aria-hidden="true" size={26} />
            <h3>A day to make your own</h3>
            <p>Add a place from your imported maps.</p>
          </div>
        )}
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

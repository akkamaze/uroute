import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileUp, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapGeometryCollection, PlaceCollection } from "../plan/map-data";
import { TripMap } from "../plan/TripMap";
import {
  addImportedVisit,
  KANTO_DAYS,
  loadImportedGeometries,
  loadImportedPlaces,
  loadImportedVisits,
  removeImportedVisit,
  sameImportedGeometry,
  sameImportedPlace,
  saveImportedContent,
  type ImportedVisit,
  type KantoDay,
} from "./place-library";
import {
  parsePlaceFile,
  type ImportedGeometry,
  type ImportedPoint,
  type ImportPreview,
} from "./parse-place-file";
import "./imported-places.css";

function toMapPlaces(points: readonly ImportedPoint[], numbered = false): PlaceCollection {
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
        ...(numbered ? { marker: `place-${index + 1}` } : {}),
        synthetic: false,
      },
    })),
  };
}

function toMapGeometry(geometries: readonly ImportedGeometry[]): MapGeometryCollection {
  return {
    type: "FeatureCollection",
    features: geometries.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry:
        "coordinates" in item
          ? { type: "LineString", coordinates: item.coordinates }
          : { type: "Polygon", coordinates: item.rings },
      properties: {
        id: item.id,
        kind: "coordinates" in item ? "line" : "area",
        name: item.name,
      },
    })),
  };
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function ImportedPlacesPage(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLElement>(null);
  const [places, setPlaces] = useState<ImportedPoint[]>([]);
  const [geometries, setGeometries] = useState<ImportedGeometry[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<KantoDay>(KANTO_DAYS[0].date);
  const [folder, setFolder] = useState("All folders");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"places" | "plan">("places");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([loadImportedPlaces(), loadImportedGeometries(), loadImportedVisits()])
      .then(([storedPlaces, storedGeometries, storedVisits]) => {
        if (active) {
          setPlaces(storedPlaces);
          setGeometries(storedGeometries);
          setVisits(storedVisits);
        }
      })
      .catch(() => {
        if (active) {
          setError("Imported places could not be read from this device.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const folders = useMemo(
    () => ["All folders", ...new Set([...places, ...geometries].map((item) => item.folder))],
    [geometries, places],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePlaces = useMemo(
    () =>
      places.filter(
        (place) =>
          (folder === "All folders" || place.folder === folder) &&
          (normalizedQuery === "" ||
            `${place.name} ${place.folder}`.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [folder, normalizedQuery, places],
  );
  const visibleGeometries = useMemo(
    () =>
      geometries.filter(
        (item) =>
          (folder === "All folders" || item.folder === folder) &&
          (normalizedQuery === "" ||
            `${item.name} ${item.folder}`.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [folder, geometries, normalizedQuery],
  );
  const dayPlaces = useMemo(
    () =>
      visits
        .filter((visit) => visit.day === selectedDay)
        .flatMap((visit) => {
          const place = places.find((candidate) => candidate.id === visit.placeId);

          return place === undefined ? [] : [place];
        }),
    [places, selectedDay, visits],
  );
  const selectedPlace = places.find((place) => place.id === selectedId);
  const mapPlaces = useMemo(
    () => toMapPlaces(view === "plan" ? dayPlaces : visiblePlaces),
    [dayPlaces, view, visiblePlaces],
  );
  const mapGeometry = useMemo(
    () => toMapGeometry(view === "plan" ? geometries : visibleGeometries),
    [geometries, view, visibleGeometries],
  );
  const orderPlaces = useMemo(() => toMapPlaces(dayPlaces, true), [dayPlaces]);
  const displayedPlaces = view === "plan" ? dayPlaces : visiblePlaces;
  const knownPreviewCount =
    preview?.points.filter((point) => places.some((place) => sameImportedPlace(point, place)))
      .length ?? 0;
  const knownPreviewLineCount =
    preview?.lines.filter((line) => geometries.some((known) => sameImportedGeometry(line, known)))
      .length ?? 0;
  const knownPreviewAreaCount =
    preview?.areas.filter((area) => geometries.some((known) => sameImportedGeometry(area, known)))
      .length ?? 0;
  const lineCount = geometries.filter((item) => "coordinates" in item).length;
  const areaCount = geometries.length - lineCount;
  const existingCoordinateCount =
    preview?.points.filter(
      (point) =>
        !places.some((place) => sameImportedPlace(point, place)) &&
        places.some(
          (place) => place.longitude === point.longitude && place.latitude === point.latitude,
        ),
    ).length ?? 0;

  useEffect(() => {
    if (selectedId !== null) {
      selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  async function chooseFile(file: File | undefined): Promise<void> {
    if (file === undefined) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setPreview(await parsePlaceFile(file));
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "This file could not be read.");
    } finally {
      setBusy(false);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function confirmImport(): Promise<void> {
    if (preview === null) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveImportedContent(preview.points, [...preview.lines, ...preview.areas]);
      const [storedPlaces, storedGeometries] = await Promise.all([
        loadImportedPlaces(),
        loadImportedGeometries(),
      ]);
      setPlaces(storedPlaces);
      setGeometries(storedGeometries);
      setPreview(null);
      setView("places");
      setNotice(
        saved.placeCount === 0 && saved.lineCount === 0 && saved.areaCount === 0
          ? "These map items are already on this device."
          : `${countLabel(saved.placeCount, "place")}, ${countLabel(saved.lineCount, "line")} and ${countLabel(saved.areaCount, "area")} imported.`,
      );
    } catch {
      setError("Import could not be saved on this device. No new map items were confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function addToPlan(point: ImportedPoint): Promise<void> {
    setError("");
    try {
      const result = await addImportedVisit(selectedDay, point.id);
      setVisits(await loadImportedVisits());
      setNotice(
        result === "duplicate"
          ? `${point.name} is already on this day.`
          : `${point.name} added to ${KANTO_DAYS.find((day) => day.date === selectedDay)?.label}.`,
      );
      setView("plan");
    } catch {
      setError("This place could not be added to the plan on this device.");
    }
  }

  async function removeFromPlan(point: ImportedPoint): Promise<void> {
    setError("");
    try {
      await removeImportedVisit(selectedDay, point.id);
      setVisits(await loadImportedVisits());
      setNotice(`${point.name} removed from this day.`);
    } catch {
      setError("This place could not be removed from the plan.");
    }
  }

  return (
    <section className="imported-page">
      <header className="imported-page__header">
        <Link aria-label="Back to trips" to="/trips">
          <ArrowLeft aria-hidden="true" size={21} />
        </Link>
        <div>
          <h1>Kanto trip</h1>
          <p>27 Sep–1 Oct 2026 · saved on this device</p>
        </div>
        <button
          aria-label="Import KML or KMZ"
          className="imported-page__import-button"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <FileUp aria-hidden="true" size={21} />
        </button>
        <input
          accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
          aria-label="Choose KML or KMZ file"
          className="imported-page__file-input"
          onChange={(event) => void chooseFile(event.currentTarget.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
      </header>

      {error !== "" ? (
        <p className="imported-page__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice !== "" ? (
        <p className="imported-page__notice" role="status">
          {notice}
        </p>
      ) : null}
      {busy ? (
        <p className="imported-page__notice" role="status">
          Reading places…
        </p>
      ) : null}

      {preview === null ? null : (
        <section aria-label="Import review" className="imported-page__preview">
          <div className="imported-page__preview-heading">
            <h2>Review import</h2>
            <button onClick={() => setPreview(null)} type="button">
              Cancel
            </button>
          </div>
          <p className="imported-page__source-name">{preview.fileName}</p>
          <p>
            {preview.points.length} points · {preview.lines.length}{" "}
            {preview.lines.length === 1 ? "line" : "lines"} · {preview.areas.length}{" "}
            {preview.areas.length === 1 ? "area" : "areas"}
          </p>
          <p>{knownPreviewCount} points already on this device.</p>
          {knownPreviewLineCount > 0 ? (
            <p>{countLabel(knownPreviewLineCount, "line")} already on this device.</p>
          ) : null}
          {knownPreviewAreaCount > 0 ? (
            <p>{countLabel(knownPreviewAreaCount, "area")} already on this device.</p>
          ) : null}
          {existingCoordinateCount > 0 ? (
            <p className="imported-page__warning">
              {existingCoordinateCount} points share coordinates with places already on this device.
              Review their names and folders.
            </p>
          ) : null}
          {preview.unsupportedCount > 0 ||
          preview.invalidCount > 0 ||
          preview.invalidGeometryCount > 0 ? (
            <p>
              {preview.unsupportedCount} unsupported · {preview.invalidCount}{" "}
              {preview.invalidCount === 1 ? "point" : "points"} needing correction ·{" "}
              {preview.invalidGeometryCount}{" "}
              {preview.invalidGeometryCount === 1 ? "geometry item" : "geometry items"} needing
              correction
            </p>
          ) : null}
          {preview.warnings.map((warning) => (
            <p className="imported-page__warning" key={warning}>
              {warning}
            </p>
          ))}
          {preview.skipped.length > 0 ? (
            <details className="imported-page__skipped">
              <summary>Review {preview.skipped.length} items not imported</summary>
              <ul>
                {preview.skipped.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    {item.name} · {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="imported-page__folder-counts">
            {Array.from(new Set(preview.points.map((point) => point.folder))).map((name) => (
              <span key={name}>
                {name}: {preview.points.filter((point) => point.folder === name).length}
              </span>
            ))}
          </div>
          <button
            className="imported-page__confirm"
            disabled={
              busy ||
              (preview.points.length === 0 &&
                preview.lines.length === 0 &&
                preview.areas.length === 0)
            }
            onClick={() => void confirmImport()}
            type="button"
          >
            Import {countLabel(preview.points.length - knownPreviewCount, "place")},{" "}
            {countLabel(preview.lines.length - knownPreviewLineCount, "line")} and{" "}
            {countLabel(preview.areas.length - knownPreviewAreaCount, "area")}
          </button>
        </section>
      )}

      {places.length === 0 && geometries.length === 0 ? (
        <div className="imported-page__empty">
          <MapPin aria-hidden="true" size={30} />
          <h2>Bring your places onto the map</h2>
          <p>Import a KML or KMZ file, review its points, then choose places for each day.</p>
          <button onClick={() => fileInputRef.current?.click()} type="button">
            Choose a file
          </button>
        </div>
      ) : (
        <>
          <div className="imported-page__tabs" role="group" aria-label="Kanto trip views">
            <button
              aria-pressed={view === "places"}
              onClick={() => setView("places")}
              type="button"
            >
              Places <span>{places.length}</span>
            </button>
            <button aria-pressed={view === "plan"} onClick={() => setView("plan")} type="button">
              Plan <span>{visits.length}</span>
            </button>
          </div>
          {geometries.length > 0 ? (
            <p className="imported-page__map-summary">
              {countLabel(lineCount, "line")} and {countLabel(areaCount, "area")} shown on map
            </p>
          ) : null}
          <div className="imported-page__map">
            <TripMap
              geometry={mapGeometry}
              onSelect={(id) => setSelectedId(id)}
              orderPlaces={orderPlaces}
              places={mapPlaces}
              selectedId={selectedId}
              showLocate={false}
              variant="discovery"
            />
          </div>
          <div className="imported-page__content">
            {view === "places" ? (
              <div className="imported-page__filters">
                <label>
                  <Search aria-hidden="true" size={18} />
                  <input
                    aria-label="Search imported places"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search places"
                    type="search"
                    value={query}
                  />
                </label>
                <select
                  aria-label="Filter by folder"
                  onChange={(event) => setFolder(event.target.value)}
                  value={folder}
                >
                  {folders.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="imported-page__days" role="group" aria-label="Plan day">
              {KANTO_DAYS.map((day) => (
                <button
                  aria-pressed={selectedDay === day.date}
                  key={day.date}
                  onClick={() => setSelectedDay(day.date)}
                  type="button"
                >
                  {day.label}
                </button>
              ))}
            </div>
            {selectedPlace === undefined ? null : (
              <article className="imported-page__selected" ref={selectedRef}>
                <span>{selectedPlace.folder}</span>
                <h2>{selectedPlace.name}</h2>
                {selectedPlace.description !== "" ? <p>{selectedPlace.description}</p> : null}
                {selectedPlace.mediaReferences.length > 0 ? (
                  <details>
                    <summary>{selectedPlace.mediaReferences.length} source media links</summary>
                    <ul>
                      {selectedPlace.mediaReferences.map((url, index) => (
                        <li key={`${url}-${index}`}>
                          <a href={url} rel="noopener noreferrer" target="_blank">
                            Open source media {index + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p>Coordinates from {selectedPlace.sourceFile}</p>
                <button onClick={() => void addToPlan(selectedPlace)} type="button">
                  <Plus aria-hidden="true" size={18} /> Add to{" "}
                  {KANTO_DAYS.find((day) => day.date === selectedDay)?.label}
                </button>
              </article>
            )}
            <div className="imported-page__list-heading">
              <h2>
                {view === "places"
                  ? "Imported places"
                  : `Plan · ${KANTO_DAYS.find((day) => day.date === selectedDay)?.label}`}
              </h2>
              <span>{displayedPlaces.length}</span>
            </div>
            {displayedPlaces.length === 0 ? (
              <p className="imported-page__list-empty">
                {view === "plan"
                  ? "No places on this day yet. Choose a point from Places."
                  : "No places match this search."}
              </p>
            ) : (
              <div className="imported-page__list">
                {displayedPlaces
                  .slice(0, view === "places" ? 100 : undefined)
                  .map((point, index) => (
                    <article className="imported-page__row" key={point.id}>
                      <button onClick={() => setSelectedId(point.id)} type="button">
                        <span>
                          {view === "plan" ? (
                            `${index + 1}.`
                          ) : (
                            <MapPin aria-hidden="true" size={17} />
                          )}
                        </span>
                        <span>
                          <strong>{point.name}</strong>
                          <small>{point.folder}</small>
                        </span>
                      </button>
                      {view === "plan" ? (
                        <button
                          aria-label={`Remove ${point.name} from this day`}
                          onClick={() => void removeFromPlan(point)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      ) : (
                        <button
                          aria-label={`Add ${point.name} to this day`}
                          onClick={() => void addToPlan(point)}
                          type="button"
                        >
                          <Plus aria-hidden="true" size={18} />
                        </button>
                      )}
                    </article>
                  ))}
                {view === "places" && displayedPlaces.length > 100 ? (
                  <p className="imported-page__more">
                    Showing the first 100. Search or choose a folder to narrow the list.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

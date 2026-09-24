import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  FileUp,
  Layers,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapGeometryCollection, PlaceCollection } from "../plan/map-data";
import { TripMap } from "../plan/TripMap";
import { addPlaceToKyotoDay } from "../plan/plan-store";
import { ImportLayerMenu } from "./ImportLayerMenu";
import {
  availableDestinations,
  destinationDays,
  destinationLabel,
  isMapDestination,
  loadMapDestination,
  saveMapDestination,
  type MapDestination,
} from "./map-destination";
import {
  buildImportLayerSources,
  isImportLayerVisible,
  hideAllImportLayers,
  loadHiddenImportLayers,
  saveHiddenImportLayers,
  showAllImportLayers,
} from "./import-layer-visibility";
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
  const globalMaps = window.location.pathname === "/maps";
  const requested = new URLSearchParams(window.location.search);
  const layersButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLElement>(null);
  const [places, setPlaces] = useState<ImportedPoint[]>([]);
  const [geometries, setGeometries] = useState<ImportedGeometry[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(requested.get("place"));
  const [destination, setDestination] = useState<MapDestination | null>(() => {
    const requestedDestination = { trip: requested.get("trip"), day: requested.get("day") };

    return isMapDestination(requestedDestination) ? requestedDestination : loadMapDestination();
  });
  const [selectedDay, setSelectedDay] = useState<KantoDay>(KANTO_DAYS[0].date);
  const [folder, setFolder] = useState("All folders");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [view, setView] = useState<"places" | "plan">("places");
  const [layersOpen, setLayersOpen] = useState(false);
  const [hiddenLayers, setHiddenLayers] = useState(loadHiddenImportLayers);
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

  useEffect(() => {
    saveHiddenImportLayers(hiddenLayers);
  }, [hiddenLayers]);

  useEffect(() => {
    if (destination !== null) {
      saveMapDestination(destination);
    }
  }, [destination]);

  function toggleLayer(key: string): void {
    setHiddenLayers((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  const layerSources = useMemo(
    () => buildImportLayerSources(places, geometries, hiddenLayers),
    [places, geometries, hiddenLayers],
  );
  const allLayersHidden =
    layerSources.length > 0 &&
    layerSources.every(
      (source) =>
        source.shownCounts.point + source.shownCounts.line + source.shownCounts.area === 0,
    );

  function closeLayers(): void {
    setLayersOpen(false);
    window.requestAnimationFrame(() => layersButtonRef.current?.focus({ preventScroll: true }));
  }

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
  const clusterAnchorPlaces = useMemo(
    () => toMapPlaces(view === "plan" ? dayPlaces : visiblePlaces),
    [dayPlaces, view, visiblePlaces],
  );
  const mapPlaces = useMemo(
    () =>
      toMapPlaces(
        (view === "plan" ? dayPlaces : visiblePlaces).filter((point) =>
          isImportLayerVisible(point, hiddenLayers),
        ),
      ),
    [dayPlaces, hiddenLayers, view, visiblePlaces],
  );
  const mapGeometry = useMemo(
    () =>
      toMapGeometry(
        (view === "plan" ? [] : visibleGeometries).filter((item) =>
          isImportLayerVisible(item, hiddenLayers),
        ),
      ),
    [hiddenLayers, view, visibleGeometries],
  );
  const orderPlaces = useMemo(
    () =>
      toMapPlaces(
        dayPlaces.filter((point) => isImportLayerVisible(point, hiddenLayers)),
        true,
      ),
    [dayPlaces, hiddenLayers],
  );
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
  const lineCount = mapGeometry.features.filter((item) => item.properties.kind === "line").length;
  const areaCount = mapGeometry.features.length - lineCount;
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
      setSearchOpen(globalMaps && preview.points.length > 0 && preview.points.length <= 24);
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
    if (globalMaps && destination === null) {
      setError("Choose a trip and day before adding this place.");

      return;
    }
    const target = globalMaps ? destination : { trip: "kanto" as const, day: selectedDay };
    if (target === null) {
      return;
    }
    try {
      let result: "added" | "duplicate" | "invalid";
      if (target.trip !== "kyoto") {
        result = await addImportedVisit(
          target.day,
          point.id,
          target.trip === "kanto" ? undefined : target.trip,
        );
        setVisits(await loadImportedVisits());
      } else {
        result = addPlaceToKyotoDay(Number(target.day.slice(-2)), {
          placeId: point.id,
          time: "",
          notes: "",
        });
      }
      if (result === "invalid") {
        setError("This place could not be added to the selected day.");

        return;
      }
      setNotice(
        result === "duplicate"
          ? `${point.name} is already in ${destinationLabel(target)}.`
          : `${point.name} added to ${destinationLabel(target)}.`,
      );
      if (!globalMaps) {
        setView("plan");
      }
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

  const folderFilter = (
    <select
      aria-label="Filter by folder"
      onChange={(event) => {
        setFolder(event.target.value);
        if (globalMaps) {
          setSearchOpen(true);
        }
        setVisibleLimit(24);
      }}
      value={folder}
    >
      {folders.map((name) => (
        <option key={name}>{name}</option>
      ))}
    </select>
  );
  const placeFilters = (
    <div className="imported-page__filters">
      <label>
        <Search aria-hidden="true" size={19} />
        <input
          aria-label="Search imported places"
          onFocus={() => globalMaps && setSearchOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleLimit(24);
          }}
          placeholder="Search all imported places"
          type="search"
          value={query}
        />
      </label>
      {!globalMaps ? folderFilter : null}
    </div>
  );

  return (
    <section className={globalMaps ? "imported-page imported-page--maps" : "imported-page"}>
      <header className="imported-page__header">
        {!globalMaps ? (
          <Link aria-label="Back to trips" to="/trips">
            <ArrowLeft aria-hidden="true" size={21} />
          </Link>
        ) : null}
        {globalMaps ? (
          <>
            <h1 className="imported-page__visually-hidden">Maps</h1>
            {placeFilters}
          </>
        ) : (
          <div>
            <h1>Kanto trip</h1>
            <p>27 Sep–1 Oct 2026 · saved on this device</p>
          </div>
        )}
        <button
          aria-controls="import-map-layers"
          aria-expanded={layersOpen}
          aria-label="Map layers"
          className="imported-page__layers-button"
          disabled={places.length === 0 && geometries.length === 0}
          onClick={() => setLayersOpen(true)}
          ref={layersButtonRef}
          type="button"
        >
          <Layers aria-hidden="true" size={21} />
        </button>
        <label className="imported-page__import-button">
          <FileUp aria-hidden="true" size={21} />
          <input
            accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            aria-label="Choose KML or KMZ file"
            className="imported-page__file-input"
            disabled={busy}
            id="import-kml-file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void chooseFile(file);
            }}
            type="file"
          />
        </label>
      </header>

      <ImportLayerMenu
        hidden={hiddenLayers}
        onClose={closeLayers}
        onHideAll={() => setHiddenLayers((current) => hideAllImportLayers(current, layerSources))}
        onShowAll={() => setHiddenLayers((current) => showAllImportLayers(current, layerSources))}
        onShowAllSource={(source) =>
          setHiddenLayers((current) => showAllImportLayers(current, [source]))
        }
        onToggle={toggleLayer}
        open={layersOpen && layerSources.length > 0}
        sources={layerSources}
      />

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
          <p className="imported-page__source-name">{preview.sourceName || preview.fileName}</p>
          <p>
            {preview.points.length} {preview.points.length === 1 ? "point" : "points"} ·{" "}
            {preview.lines.length} {preview.lines.length === 1 ? "line" : "lines"} ·{" "}
            {preview.areas.length} {preview.areas.length === 1 ? "area" : "areas"}
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
          <p>Import a KML or KMZ file, then add places to any trip day.</p>
          {globalMaps && destination !== null ? (
            <p className="imported-page__empty-target">Adding to {destinationLabel(destination)}</p>
          ) : null}
          <label htmlFor="import-kml-file">Choose a file</label>
        </div>
      ) : (
        <>
          {globalMaps ? null : (
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
          )}
          {allLayersHidden ? (
            <p className="imported-page__layers-empty" role="status">
              All imported layers are hidden.
              <button onClick={() => setLayersOpen(true)} type="button">
                Open layers
              </button>
            </p>
          ) : null}
          {!globalMaps ? (
            <p className="imported-page__map-summary">
              {countLabel(mapPlaces.features.length, "point")}, {countLabel(lineCount, "line")} and{" "}
              {countLabel(areaCount, "area")} shown on map
            </p>
          ) : null}
          <div className="imported-page__map">
            <TripMap
              clusterAnchorPlaces={clusterAnchorPlaces}
              frameKey={`${view}:${selectedDay}:${folder}:${normalizedQuery}:${places.length}:${geometries.length}`}
              geometry={mapGeometry}
              onSelect={(id) => {
                setSelectedId(id);
                setSearchOpen(false);
              }}
              orderPlaces={orderPlaces}
              places={mapPlaces}
              selectedId={selectedId}
              showLocate={false}
              showDayOrder={!globalMaps}
              variant="discovery"
            />
          </div>
          <div
            className={`imported-page__content${globalMaps ? (searchOpen || selectedPlace !== undefined ? " imported-page__content--open" : " imported-page__content--closed") : ""}`}
          >
            {!globalMaps && view === "places" ? placeFilters : null}
            {globalMaps && selectedPlace !== undefined && !searchOpen ? (
              <div className="imported-page__destination" aria-label="Add to plan destination">
                <button
                  aria-expanded={destinationOpen}
                  className="imported-page__destination-toggle"
                  onClick={() => setDestinationOpen((open) => !open)}
                  type="button"
                >
                  <MapPin aria-hidden="true" size={18} />
                  <span>
                    <small>Add places to</small>
                    <strong>
                      {destination === null
                        ? "Choose a trip and day"
                        : destinationLabel(destination)}
                    </strong>
                  </span>
                  <ChevronDown aria-hidden="true" size={17} />
                </button>
                {destinationOpen ? (
                  <div className="imported-page__destination-fields">
                    <select
                      aria-label="Destination trip"
                      value={destination?.trip ?? ""}
                      onChange={(event) => {
                        const trip = event.target.value;
                        setDestination({ trip, day: destinationDays(trip)[0]?.day ?? "" });
                      }}
                    >
                      <option value="" disabled>
                        Choose trip
                      </option>
                      {availableDestinations().map((trip) => (
                        <option key={trip.id} value={trip.id}>
                          {trip.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Destination day"
                      disabled={destination === null}
                      value={destination?.day ?? ""}
                      onChange={(event) => {
                        if (destination !== null) {
                          setDestination({ ...destination, day: event.target.value });
                          setDestinationOpen(false);
                        }
                      }}
                    >
                      {destination === null ? (
                        <option value="">Choose day</option>
                      ) : (
                        destinationDays(destination.trip).map(({ day, label }) => (
                          <option key={day} value={day}>
                            {label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : !globalMaps ? (
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
            ) : null}
            {selectedPlace === undefined || (globalMaps && searchOpen) ? null : (
              <article className="imported-page__selected" ref={selectedRef}>
                {globalMaps ? (
                  <button
                    aria-label="Close place details"
                    className="imported-page__selected-close"
                    onClick={() => setSelectedId(null)}
                    type="button"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                ) : null}
                <span>{selectedPlace.folder}</span>
                <h2>{selectedPlace.name}</h2>
                {!isImportLayerVisible(selectedPlace, hiddenLayers) ? (
                  <p className="imported-page__selected-hidden">
                    Hidden on map. You can still use this place in your plan. Open Map layers to
                    show it.
                  </p>
                ) : null}
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
                <p>Coordinates from {selectedPlace.sourceName?.trim() || "an imported map"}</p>
                <button onClick={() => void addToPlan(selectedPlace)} type="button">
                  <Plus aria-hidden="true" size={18} /> Add to{" "}
                  {globalMaps
                    ? destination === null
                      ? "plan"
                      : destinationLabel(destination)
                    : KANTO_DAYS.find((day) => day.date === selectedDay)?.label}
                </button>
              </article>
            )}
            {!globalMaps || searchOpen ? (
              <>
                <div className="imported-page__list-heading">
                  <h2>
                    {view === "places"
                      ? globalMaps
                        ? "Search results"
                        : "Imported places"
                      : `Plan · ${KANTO_DAYS.find((day) => day.date === selectedDay)?.label}`}
                  </h2>
                  <span>{displayedPlaces.length}</span>
                  {globalMaps ? (
                    <button onClick={() => setSearchOpen(false)} type="button">
                      Done
                    </button>
                  ) : null}
                </div>
                {globalMaps ? (
                  <div className="imported-page__sheet-filter">{folderFilter}</div>
                ) : null}
                {displayedPlaces.length === 0 ? (
                  <p className="imported-page__list-empty">
                    {view === "plan"
                      ? "No places on this day yet. Choose a point from Places."
                      : "No places match this search."}
                  </p>
                ) : (
                  <div className="imported-page__list">
                    {displayedPlaces
                      .slice(0, view === "places" ? (globalMaps ? visibleLimit : 100) : undefined)
                      .map((point, index) => (
                        <article className="imported-page__row" key={point.id}>
                          <button
                            onClick={() => {
                              setSelectedId(point.id);
                              setSearchOpen(false);
                            }}
                            type="button"
                          >
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
                          ) : globalMaps ? null : (
                            <button
                              aria-label={`Add ${point.name} to ${globalMaps ? (destination === null ? "selected plan day" : destinationLabel(destination)) : "this day"}`}
                              onClick={() => void addToPlan(point)}
                              type="button"
                            >
                              <Plus aria-hidden="true" size={18} />
                            </button>
                          )}
                        </article>
                      ))}
                    {globalMaps && displayedPlaces.length > visibleLimit ? (
                      <button
                        className="imported-page__show-more"
                        onClick={() => setVisibleLimit((limit) => limit + 24)}
                        type="button"
                      >
                        Show more places
                      </button>
                    ) : null}
                    {!globalMaps && view === "places" && displayedPlaces.length > 100 ? (
                      <p className="imported-page__more">
                        Showing the first 100. Search or choose a folder to narrow the list.
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

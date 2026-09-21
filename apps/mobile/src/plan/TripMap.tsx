import { LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type Source,
} from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";

import { allowAnyOrientation, preferPortraitOrientation } from "../orientation";
import { KYOTO_CENTER, type PlaceCollection } from "./map-data";
import { createMapMarker, createPlaceHead, createNameLabel, getMapLabel } from "./map-markers";

const POINT_SOURCE_ID = "trip-places";
const CLUSTER_LAYER_ID = "place-clusters";
const SYMBOL_LAYER_ID = "place-symbols";
const SELECTED_SOURCE_ID = "selected-place";
const SELECTED_LAYER_ID = "selected-place-symbol";
const LABEL_LAYER_ID = "place-names";
const SELECTED_LABEL_LAYER_ID = "selected-place-name";
const PLACE_LABEL_OFFSET: [number, number] = [18, 0];
const TILE_TIMEOUT_MS = 12_000;

setWorkerUrl(mapLibreWorkerUrl);

const BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    openStreetMap: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: "open-street-map", type: "raster" as const, source: "openStreetMap" }],
};

interface TripMapProps {
  bottomInset?: number;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  id?: string;
  inactive?: boolean;
  onSelect: (id: string) => void;
  places: PlaceCollection;
  orderPlaces: PlaceCollection;
  selectedId: string | null;
  showLocate?: boolean;
  variant?: "discovery" | "planner";
}

type MapStatus = "loading" | "ready" | "error";

interface MapDiagnosticsSnapshot {
  center: { latitude: number; longitude: number };
  clusterLayerReady: boolean;
  clusteringEnabled: boolean;
  featureCount: number | null;
  firstClusterPoint: { x: number; y: number } | null;
  moving: boolean;
  renderedClusterCount: number;
  renderedClusterLabels: string[];
  renderedSelectedIds: string[];
  placeLabels: { name: string; label: string }[];
  renderedPhotoIds: string[];
  markerMode: "places" | "order";
  numberedPlaces: { id: string; marker: string }[];
  sourceId: typeof POINT_SOURCE_ID;
  sourceLoaded: boolean;
  status: MapStatus;
  zoom: number;
}

type DiagnosticsWindow = Window & {
  __urouteMapDiagnostics?: () => MapDiagnosticsSnapshot;
};

function getSourceFeatureCount(source: GeoJSONSource): number | null {
  const data: unknown = source.serialize().data;

  if (typeof data !== "object" || data === null || !("features" in data)) {
    return null;
  }
  const features = data.features;

  return Array.isArray(features) ? features.length : null;
}

function framePlaces(
  map: MapLibreMap,
  places: PlaceCollection,
  animated: boolean,
  bottomInset = 0,
): void {
  const cameraPadding = {
    top: 104,
    right: 156,
    bottom: Math.max(84, bottomInset + 64),
    left: 32,
  };

  if (places.features.length === 0) {
    map.easeTo({
      center: [KYOTO_CENTER[0], KYOTO_CENTER[1]],
      duration: animated ? 350 : 0,
      padding: cameraPadding,
      zoom: 13.4,
    });

    return;
  }

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  places.features.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;

    if (longitude === undefined || latitude === undefined) {
      return;
    }

    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  });

  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      duration: animated ? 350 : 0,
      maxZoom: 14,
      padding: cameraPadding,
    },
  );
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");

    if (context === null) {
      return false;
    }

    context.getExtension("WEBGL_lose_context")?.loseContext();

    return true;
  } catch {
    return false;
  }
}

function isGeoJsonSource(source: Source): source is GeoJSONSource {
  return source.type === "geojson";
}

function getSource(map: MapLibreMap): GeoJSONSource | null {
  const source = map.getSource(POINT_SOURCE_ID);

  return source !== undefined && isGeoJsonSource(source) ? source : null;
}

function syncSelectedPlace(
  map: MapLibreMap,
  places: PlaceCollection,
  selectedId: string | null,
): void {
  const source = map.getSource(SELECTED_SOURCE_ID);
  if (source !== undefined && isGeoJsonSource(source)) {
    void source.setData({
      type: "FeatureCollection",
      features: places.features.filter((place) => place.properties.id === selectedId),
    });
  }
}

export function TripMap({
  bottomInset = 0,
  expanded: controlledExpanded,
  onExpandedChange,
  id,
  inactive = false,
  onSelect,
  places: allPlaces,
  orderPlaces,
  selectedId,
  showLocate = true,
  variant = "planner",
}: TripMapProps): React.JSX.Element {
  const [markerMode, setMarkerMode] = useState<"places" | "order">("places");
  const places = markerMode === "order" ? orderPlaces : allPlaces;
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomInsetRef = useRef(bottomInset);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placesRef = useRef(places);
  const selectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const statusRef = useRef<MapStatus>(status);

  placesRef.current = places;
  selectRef.current = onSelect;
  selectedIdRef.current = selectedId;
  bottomInsetRef.current = bottomInset;
  statusRef.current = status;

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return undefined;
    }

    if (!supportsWebGl()) {
      setErrorMessage("This device does not provide the WebGL support required for the map.");
      setStatus("error");

      return undefined;
    }

    let map: MapLibreMap | null = null;
    let layersReady = false;
    let disposed = false;
    let failed = false;
    const tileTimer: { id: number | undefined } = { id: undefined };

    function showError(message: string): void {
      if (disposed) {
        return;
      }

      failed = true;
      if (tileTimer.id !== undefined) {
        window.clearTimeout(tileTimer.id);
      }

      setErrorMessage(message);
      setStatus("error");
    }

    try {
      map = new MapLibreMap({
        container,
        style: BASEMAP_STYLE,
        center: [KYOTO_CENTER[0], KYOTO_CENTER[1]],
        zoom: 13.4,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      mapRef.current = map;
    } catch {
      showError("The map could not start. Check WebGL support and try again.");

      return undefined;
    }

    const activeMap = map;
    const diagnosticsWindow = window as DiagnosticsWindow;
    const readDiagnostics = (): MapDiagnosticsSnapshot => {
      const source = getSource(activeMap);
      const sourceOptions = source?.serialize();
      const clusters =
        activeMap.getLayer(CLUSTER_LAYER_ID) === undefined
          ? []
          : activeMap.queryRenderedFeatures({ layers: [CLUSTER_LAYER_ID] });
      const canvas = activeMap.getCanvas();
      const firstCluster = clusters
        .flatMap((cluster) =>
          cluster.geometry.type === "Point"
            ? [activeMap.project(cluster.geometry.coordinates as [number, number])]
            : [],
        )
        .sort((first, second) => {
          const centerX = canvas.clientWidth / 2;
          const centerY = canvas.clientHeight / 2;

          return (
            Math.hypot(first.x - centerX, first.y - centerY) -
            Math.hypot(second.x - centerX, second.y - centerY)
          );
        })[0];
      const center = activeMap.getCenter();

      return {
        center: { latitude: center.lat, longitude: center.lng },
        clusterLayerReady: activeMap.getLayer(CLUSTER_LAYER_ID) !== undefined,
        clusteringEnabled: sourceOptions?.cluster === true,
        markerMode,
        renderedPhotoIds:
          markerMode === "order" || activeMap.getLayer(SYMBOL_LAYER_ID) === undefined
            ? []
            : activeMap
                .queryRenderedFeatures({ layers: [SYMBOL_LAYER_ID] })
                .filter((feature) => typeof feature.properties.image === "string")
                .map((feature) => String(feature.properties.id)),
        placeLabels:
          activeMap.getLayer(LABEL_LAYER_ID) === undefined
            ? []
            : activeMap
                .queryRenderedFeatures({ layers: [LABEL_LAYER_ID, SELECTED_LABEL_LAYER_ID] })
                .map((feature) => ({
                  name: String(feature.properties.name),
                  label: getMapLabel(String(feature.properties.name)),
                })),
        numberedPlaces:
          markerMode === "order"
            ? placesRef.current.features.map((feature) => ({
                id: feature.properties.id,
                marker: feature.properties.marker ?? "",
              }))
            : [],
        featureCount: source === null ? null : getSourceFeatureCount(source),
        firstClusterPoint:
          firstCluster === undefined ? null : { x: firstCluster.x, y: firstCluster.y },
        moving: activeMap.isMoving(),
        renderedClusterCount: clusters.length,
        renderedClusterLabels: clusters.map((cluster) =>
          String(cluster.properties.point_count_abbreviated),
        ),
        renderedSelectedIds:
          activeMap.getLayer(SELECTED_LAYER_ID) === undefined
            ? []
            : activeMap
                .queryRenderedFeatures({ layers: [SELECTED_LAYER_ID] })
                .map((feature) => String(feature.properties.id)),
        sourceId: POINT_SOURCE_ID,
        sourceLoaded: source !== null && activeMap.isSourceLoaded(POINT_SOURCE_ID),
        status: statusRef.current,
        zoom: activeMap.getZoom(),
      };
    };

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      diagnosticsWindow.__urouteMapDiagnostics = readDiagnostics;
    }

    function handleMapError(): void {
      showError("Map tiles could not be loaded. Check the connection and try again.");
    }

    function finishReady(): void {
      if (
        !failed &&
        layersReady &&
        activeMap.isSourceLoaded(POINT_SOURCE_ID) &&
        activeMap.areTilesLoaded()
      ) {
        if (tileTimer.id !== undefined) {
          window.clearTimeout(tileTimer.id);
        }

        setStatus("ready");
        activeMap.off("render", finishReady);
      }
    }

    function handlePointClick(event: MapLayerMouseEvent): void {
      if (!layersReady) {
        return;
      }
      const selectedHit = activeMap.queryRenderedFeatures(event.point, {
        layers: [SELECTED_LAYER_ID],
      })[0];
      const clusterHit = activeMap.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID],
      })[0];
      if (selectedHit === undefined && clusterHit !== undefined) {
        handleClusterClick(event);

        return;
      }
      const hits = activeMap.queryRenderedFeatures(
        [
          [event.point.x - 16, event.point.y - 16],
          [event.point.x + 16, event.point.y + 16],
        ],
        { layers: [SELECTED_LAYER_ID, SYMBOL_LAYER_ID, SELECTED_LABEL_LAYER_ID, LABEL_LAYER_ID] },
      );
      const id: unknown = hits[0]?.properties.id;
      if (typeof id === "string") {
        selectRef.current(id);
      }
    }

    function handleClusterClick(event: MapLayerMouseEvent): void {
      const cluster = activeMap.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID],
      })[0];
      const clusterId: unknown = cluster?.properties.cluster_id;
      const source = getSource(activeMap);

      if (typeof clusterId !== "number" || source === null || cluster === undefined) {
        return;
      }

      void source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          if (!disposed) {
            activeMap.easeTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom });
          }
        })
        .catch(() => {
          if (!disposed) {
            showError("The place cluster could not be expanded. Try the map again.");
          }
        });
    }

    function handleMouseEnter(): void {
      activeMap.getCanvas().style.cursor = "pointer";
    }

    function handleMouseLeave(): void {
      activeMap.getCanvas().style.cursor = "";
    }

    function applySelection(): void {
      syncSelectedPlace(activeMap, placesRef.current, selectedIdRef.current);
    }

    function handleStyleLoad(): void {
      if (layersReady) {
        return;
      }

      try {
        activeMap.addSource(POINT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: markerMode === "places",
          clusterMaxZoom: 14,
          clusterRadius: 24,
          promoteId: "id",
        });
        activeMap.addLayer({
          id: CLUSTER_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "icon-image": ["concat", "cluster-", ["to-string", ["get", "point_count_abbreviated"]]],
            "icon-allow-overlap": true,
          },
        });
        activeMap.addLayer({
          id: SYMBOL_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-allow-overlap": true,
            "icon-image": ["concat", "head-", ["get", "id"]],
          },
        });
        activeMap.addSource(SELECTED_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        activeMap.addLayer({
          id: SELECTED_LAYER_ID,
          type: "symbol",
          source: SELECTED_SOURCE_ID,
          layout: {
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-image": ["concat", "selected-head-", ["get", "id"]],
          },
        });
        activeMap.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: [
            "all",
            ["!", ["has", "point_count"]],
            ["!=", ["get", "id"], selectedIdRef.current ?? ""],
          ],
          layout: {
            "icon-image": ["concat", "name-", ["get", "name"]],
            "icon-anchor": "left",
            "icon-offset": PLACE_LABEL_OFFSET,
            "icon-padding": 0,
          },
        });
        activeMap.addLayer({
          id: SELECTED_LABEL_LAYER_ID,
          type: "symbol",
          source: SELECTED_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "name-", ["get", "name"]],
            "icon-anchor": "left",
            "icon-offset": PLACE_LABEL_OFFSET,
            "icon-allow-overlap": true,
          },
        });
        activeMap.moveLayer(LABEL_LAYER_ID, SYMBOL_LAYER_ID);
        activeMap.moveLayer(SELECTED_LABEL_LAYER_ID, SYMBOL_LAYER_ID);
        activeMap.on("click", handlePointClick);
        activeMap.on("mouseenter", SYMBOL_LAYER_ID, handleMouseEnter);
        activeMap.on("mouseleave", SYMBOL_LAYER_ID, handleMouseLeave);
        layersReady = true;
        const source = getSource(activeMap);

        if (source === null) {
          showError("The map place source could not be created. Try loading the map again.");

          return;
        }

        void source
          .setData(placesRef.current)
          .then(() => {
            if (!disposed) {
              applySelection();
              framePlaces(activeMap, placesRef.current, false, bottomInsetRef.current);
              activeMap.triggerRepaint();
            }
          })
          .catch(() => {
            if (!disposed) {
              showError("The map places could not be loaded. Try loading the map again.");
            }
          });
      } catch {
        showError("The map places could not be displayed. Try loading the map again.");
      }
    }

    activeMap.setMissingStyleImageResolver(async (imageId) => {
      if (imageId.startsWith("name-")) {
        activeMap.addImage(imageId, createNameLabel(imageId.slice(5)), { pixelRatio: 2 });

        return;
      }
      if (imageId.startsWith("cluster-")) {
        activeMap.addImage(imageId, createMapMarker("cluster", imageId.slice(8)), {
          pixelRatio: 2,
        });

        return;
      }
      const selected = imageId.startsWith("selected-head-");
      const id = imageId.slice(selected ? 14 : 5);
      const place = placesRef.current.features.find((feature) => feature.properties.id === id);
      if (place === undefined) {
        return;
      }
      const sprite = await createPlaceHead(
        place.properties.category,
        place.properties.image,
        markerMode === "order" ? place.properties.marker?.slice(6) : undefined,
        selected,
      );
      if (!disposed && !activeMap.hasImage(imageId)) {
        activeMap.addImage(imageId, sprite, { pixelRatio: 2 });
      }
    });
    activeMap.on("error", handleMapError);
    activeMap.on("style.load", handleStyleLoad);
    activeMap.on("render", finishReady);
    activeMap.once("idle", finishReady);
    tileTimer.id = window.setTimeout(() => {
      showError("Map tiles took too long to load. Try again when the connection is stable.");
    }, TILE_TIMEOUT_MS);

    const resizeObserver = new ResizeObserver(() => {
      activeMap.resize();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      if (tileTimer.id !== undefined) {
        window.clearTimeout(tileTimer.id);
      }

      resizeObserver.disconnect();
      activeMap.off("error", handleMapError);
      activeMap.off("style.load", handleStyleLoad);
      activeMap.off("render", finishReady);
      activeMap.off("idle", finishReady);

      if (layersReady) {
        activeMap.off("click", handlePointClick);
        activeMap.off("mouseenter", SYMBOL_LAYER_ID, handleMouseEnter);
        activeMap.off("mouseleave", SYMBOL_LAYER_ID, handleMouseLeave);
      }

      mapRef.current = null;
      if (diagnosticsWindow.__urouteMapDiagnostics === readDiagnostics) {
        delete diagnosticsWindow.__urouteMapDiagnostics;
      }
      activeMap.remove();
    };
  }, [retryCount, markerMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (map === null) {
      return;
    }

    const source = getSource(map);

    if (source === null) {
      return;
    }

    void source
      .setData(places)
      .then(() => {
        if (mapRef.current === map) {
          syncSelectedPlace(map, places, selectedIdRef.current);
          framePlaces(map, places, true, bottomInsetRef.current);
          map.triggerRepaint();
        }
      })
      .catch(() => {
        if (mapRef.current === map) {
          setErrorMessage("The map places could not be loaded. Try loading the map again.");
          setStatus("error");
        }
      });
  }, [places]);

  useEffect(() => {
    const map = mapRef.current;

    if (map === null || getSource(map) === null) {
      return;
    }

    syncSelectedPlace(map, placesRef.current, selectedId);
    if (map.getLayer(LABEL_LAYER_ID) !== undefined) {
      map.setFilter(LABEL_LAYER_ID, [
        "all",
        ["!", ["has", "point_count"]],
        ["!=", ["get", "id"], selectedId ?? ""],
      ]);
    }
  }, [selectedId]);

  useEffect(() => {
    window.requestAnimationFrame(() => mapRef.current?.resize());
  }, [expanded, inactive]);

  function retry(): void {
    setErrorMessage("");
    setStatus("loading");
    setRetryCount((current) => current + 1);
  }

  function recenter(): void {
    const map = mapRef.current;

    if (map !== null) {
      framePlaces(map, placesRef.current, true, bottomInsetRef.current);
    }
  }

  useEffect(() => {
    if (expanded) {
      wasExpandedRef.current = true;
    } else if (wasExpandedRef.current) {
      if (!inactive) {
        expandButtonRef.current?.focus();
      }
      wasExpandedRef.current = false;
    }
  }, [expanded, inactive]);

  function toggleExpanded(): void {
    const next = !expanded;
    if (onExpandedChange !== undefined) {
      onExpandedChange(next);

      return;
    }
    setLocalExpanded(next);
    if (next) {
      allowAnyOrientation();
    } else if (variant === "planner") {
      preferPortraitOrientation();
    }
  }

  return (
    <div
      aria-hidden={inactive}
      className={`trip-map trip-map--${variant}${expanded ? " trip-map--expanded" : ""}`}
      id={id}
      inert={inactive}
      style={{ "--map-bottom-inset": `${bottomInset}px` } as React.CSSProperties}
    >
      <div className="trip-map__canvas" ref={containerRef} />

      <div className="trip-map__modes" role="group" aria-label="Map marker mode">
        <button
          type="button"
          aria-pressed={markerMode === "places"}
          onClick={() => setMarkerMode("places")}
          title="Explore places and photos"
        >
          Places
        </button>
        <button
          type="button"
          aria-pressed={markerMode === "order"}
          onClick={() => setMarkerMode("order")}
          title="Show only this day's stops in visit order"
        >
          Day order
        </button>
      </div>
      {markerMode === "order" && places.features.length === 0 ? (
        <p className="trip-map__empty-order">No stops planned for this day</p>
      ) : null}
      <div aria-label="Map controls" className="trip-map__controls" role="group">
        {showLocate ? (
          <button
            aria-label="Recenter on Kyoto"
            className="trip-map__locate"
            onClick={recenter}
            type="button"
          >
            <LocateFixed aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        ) : null}
        <button
          aria-label={expanded ? "Collapse map" : "Expand map"}
          className="trip-map__fullscreen"
          onClick={toggleExpanded}
          ref={expandButtonRef}
          type="button"
        >
          {expanded ? (
            <Minimize2 aria-hidden="true" size={20} strokeWidth={1.8} />
          ) : (
            <Maximize2 aria-hidden="true" size={20} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {status === "loading" ? <p className="trip-map__status">Loading map…</p> : null}

      {status === "error" ? (
        <div className="trip-map__error" role="alert">
          <p>{errorMessage}</p>

          <button onClick={retry} type="button">
            Retry map
          </button>
        </div>
      ) : null}
    </div>
  );
}

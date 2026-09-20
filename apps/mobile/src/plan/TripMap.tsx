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

const POINT_SOURCE_ID = "trip-places";
const CLUSTER_LAYER_ID = "place-clusters";
const POINT_LAYER_ID = "place-points";
const SYMBOL_LAYER_ID = "place-symbols";
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
  id?: string;
  inactive?: boolean;
  onSelect: (id: string) => void;
  places: PlaceCollection;
  selectedId: string | null;
  showLocate?: boolean;
  variant?: "discovery" | "planner";
}

type MapStatus = "loading" | "ready" | "error";

function framePlaces(
  map: MapLibreMap,
  places: PlaceCollection,
  animated: boolean,
  bottomInset = 0,
): void {
  const cameraPadding = {
    top: 36,
    right: 36,
    bottom: Math.max(64, bottomInset + 32),
    left: 36,
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

function createNumberMarker(label: string): ImageData {
  const canvas = document.createElement("canvas");
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Marker images are unavailable in this browser.");
  }

  context.beginPath();
  context.arc(size / 2, size / 2, 20, 0, Math.PI * 2);
  context.fillStyle = "#1677ff";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "700 22px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, size / 2, size / 2 + 1);

  return context.getImageData(0, 0, size, size);
}

function isGeoJsonSource(source: Source): source is GeoJSONSource {
  return source.type === "geojson";
}

function getSource(map: MapLibreMap): GeoJSONSource | null {
  const source = map.getSource(POINT_SOURCE_ID);

  return source !== undefined && isGeoJsonSource(source) ? source : null;
}

export function TripMap({
  bottomInset = 0,
  id,
  inactive = false,
  onSelect,
  places,
  selectedId,
  showLocate = true,
  variant = "planner",
}: TripMapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomInsetRef = useRef(bottomInset);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placesRef = useRef(places);
  const selectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const previousSelectionRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  placesRef.current = places;
  selectRef.current = onSelect;
  selectedIdRef.current = selectedId;
  bottomInsetRef.current = bottomInset;

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
      const id: unknown = event.features?.[0]?.properties.id;

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
      if (selectedIdRef.current === null) {
        return;
      }

      void activeMap.setFeatureState(
        { source: POINT_SOURCE_ID, id: selectedIdRef.current },
        { selected: true },
      );
      previousSelectionRef.current = selectedIdRef.current;
    }

    function handleStyleLoad(): void {
      if (layersReady) {
        return;
      }

      try {
        ["1", "2", "3"].forEach((label) => {
          activeMap.addImage(`place-${label}`, createNumberMarker(label), { pixelRatio: 2 });
        });
        activeMap.addSource(POINT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 24,
          promoteId: "id",
        });
        activeMap.addLayer({
          id: CLUSTER_LAYER_ID,
          type: "circle",
          source: POINT_SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1677ff",
            "circle-opacity": 0.84,
            "circle-radius": ["step", ["get", "point_count"], 14, 50, 18, 250, 22, 800, 26],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        activeMap.addLayer({
          id: POINT_LAYER_ID,
          type: "circle",
          source: POINT_SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#0b5bd3",
              "#1677ff",
            ],
            "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 16, 10],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        activeMap.addLayer({
          id: SYMBOL_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: ["all", ["!", ["has", "point_count"]], ["has", "marker"]],
          layout: {
            "icon-allow-overlap": true,
            "icon-image": ["get", "marker"],
            "icon-size": 1,
          },
        });
        activeMap.on("click", POINT_LAYER_ID, handlePointClick);
        activeMap.on("click", SYMBOL_LAYER_ID, handlePointClick);
        activeMap.on("click", CLUSTER_LAYER_ID, handleClusterClick);
        activeMap.on("mouseenter", POINT_LAYER_ID, handleMouseEnter);
        activeMap.on("mouseleave", POINT_LAYER_ID, handleMouseLeave);
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
        activeMap.off("click", POINT_LAYER_ID, handlePointClick);
        activeMap.off("click", SYMBOL_LAYER_ID, handlePointClick);
        activeMap.off("click", CLUSTER_LAYER_ID, handleClusterClick);
        activeMap.off("mouseenter", POINT_LAYER_ID, handleMouseEnter);
        activeMap.off("mouseleave", POINT_LAYER_ID, handleMouseLeave);
      }

      mapRef.current = null;
      activeMap.remove();
    };
  }, [retryCount]);

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

    if (map !== null) {
      framePlaces(map, placesRef.current, true, bottomInset);
    }
  }, [bottomInset]);

  useEffect(() => {
    const map = mapRef.current;
    const previousSelection = previousSelectionRef.current;

    if (map === null || getSource(map) === null) {
      return;
    }

    if (previousSelection !== null) {
      void map.setFeatureState(
        { source: POINT_SOURCE_ID, id: previousSelection },
        { selected: false },
      );
    }

    if (selectedId !== null) {
      void map.setFeatureState({ source: POINT_SOURCE_ID, id: selectedId }, { selected: true });
    }

    previousSelectionRef.current = selectedId;
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

  function toggleExpanded(): void {
    setExpanded((current) => {
      const next = !current;

      if (next) {
        allowAnyOrientation();
      } else if (variant === "planner") {
        preferPortraitOrientation();
      }

      return next;
    });
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

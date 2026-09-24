import { LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type FilterSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type Source,
} from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";

import { allowAnyOrientation, preferPortraitOrientation } from "../orientation";
import { MapLoading } from "./MapLoading";
import { KYOTO_CENTER, type MapGeometryCollection, type PlaceCollection } from "./map-data";
import {
  MAP_LABEL_GAP,
  placeMapLabels,
  type MapLabelPoint,
  type MapLabelSide,
} from "./map-label-placement";
import {
  createMapMarker,
  createPlaceHead,
  createNameLabel,
  getMapLabel,
  getMapLabelWidth,
} from "./map-markers";

const POINT_SOURCE_ID = "trip-places";
const GEOMETRY_SOURCE_ID = "trip-map-geometry";
const AREA_FILL_LAYER_ID = "trip-map-area-fill";
const AREA_OUTLINE_LAYER_ID = "trip-map-area-outline";
const LINE_LAYER_ID = "trip-map-lines";
const CLUSTER_LAYER_ID = "place-clusters";
const SYMBOL_LAYER_ID = "place-symbols";
const SELECTED_SOURCE_ID = "selected-place";
const SELECTED_LAYER_ID = "selected-place-symbol";
const LABEL_LAYER_ID = "place-names";
const LEFT_LABEL_LAYER_ID = "place-names-left";
const SELECTED_LABEL_LAYER_ID = "selected-place-name";
const RIGHT_LABEL_OFFSET: [number, number] = [MAP_LABEL_GAP, 0];
const LEFT_LABEL_OFFSET: [number, number] = [-MAP_LABEL_GAP, 0];
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

const EMPTY_MAP_GEOMETRY: MapGeometryCollection = {
  type: "FeatureCollection",
  features: [],
};

interface TripMapProps {
  bottomInset?: number;
  clusterAnchorPlaces?: PlaceCollection;
  expanded?: boolean;
  focusSelectedId?: string | null;
  frameKey?: string;
  initialViewport?: MapViewport | null;
  onViewportChange?: (viewport: MapViewport) => void;
  onExpandedChange?: (expanded: boolean) => void;
  id?: string;
  geometry?: MapGeometryCollection;
  inactive?: boolean;
  onSelect: (id: string) => void;
  places: PlaceCollection;
  orderPlaces: PlaceCollection;
  recenterLabel?: string;
  searchResultsMode?: boolean;
  selectedId: string | null;
  showLocate?: boolean;
  showDayOrder?: boolean;
  variant?: "discovery" | "planner";
}

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

type MapStatus = "loading" | "ready" | "error";

interface MapDiagnosticsSnapshot {
  center: { latitude: number; longitude: number };
  clusterLayerReady: boolean;
  clusteringEnabled: boolean;
  featureCount: number | null;
  geometryFeatureCount: number | null;
  firstClusterPoint: { x: number; y: number } | null;
  moving: boolean;
  renderedClusterCount: number;
  renderedClusterLabels: string[];
  renderedSelectedIds: string[];
  selectedPoint: { x: number; y: number } | null;
  placeLabels: { id: string; name: string; label: string }[];
  labelPlacements: { leftIds: string[]; rightIds: string[]; selectedSide: MapLabelSide | null };
  renderedPlaces: { id: string; x: number; y: number }[];
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
  __urouteMapFocusFirstPlace?: () => void;
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
  geometry: MapGeometryCollection = EMPTY_MAP_GEOMETRY,
): void {
  const cameraPadding = {
    top: 104,
    right: 156,
    bottom: Math.max(84, bottomInset + 64),
    left: 32,
  };

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  function include(coordinates: readonly number[]): void {
    const [longitude, latitude] = coordinates;
    if (longitude === undefined || latitude === undefined) {
      return;
    }
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  places.features.forEach((feature) => include(feature.geometry.coordinates));
  if (places.features.length === 0) {
    geometry.features.forEach((feature) => {
      const paths =
        feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      paths.forEach((path) => path.forEach(include));
    });
  }
  if (west === Number.POSITIVE_INFINITY) {
    map.easeTo({
      center: [KYOTO_CENTER[0], KYOTO_CENTER[1]],
      duration: animated ? 350 : 0,
      padding: cameraPadding,
      zoom: 13.4,
    });

    return;
  }

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

function focusMapPlace(
  map: MapLibreMap,
  places: PlaceCollection,
  id: string | null,
  bottomInset: number,
  animated: boolean,
): void {
  const feature = places.features.find((place) => place.properties.id === id);
  if (feature === undefined) {
    return;
  }
  map.easeTo({
    center: [feature.geometry.coordinates[0] ?? 0, feature.geometry.coordinates[1] ?? 0],
    offset: [0, -bottomInset / 2],
    zoom: Math.max(map.getZoom(), 14.5),
    duration: animated ? 350 : 0,
  });
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

function getGeometrySource(map: MapLibreMap): GeoJSONSource | null {
  const source = map.getSource(GEOMETRY_SOURCE_ID);

  return source !== undefined && isGeoJsonSource(source) ? source : null;
}

function getSourcePlaces(
  places: PlaceCollection,
  selectedId: string | null,
  markerMode: "places" | "order",
  clusterAnchorPlaces?: PlaceCollection,
): PlaceCollection {
  const visibleIds = new Set(places.features.map((place) => place.properties.id));
  const sourcePlaces =
    markerMode === "places" && clusterAnchorPlaces !== undefined
      ? {
          ...clusterAnchorPlaces,
          features: clusterAnchorPlaces.features.map((place) => ({
            ...place,
            properties: {
              ...place.properties,
              visible: visibleIds.has(place.properties.id) ? 1 : 0,
            },
          })),
        }
      : places;
  if (markerMode === "order" || selectedId === null) {
    return sourcePlaces;
  }

  return {
    ...sourcePlaces,
    features: sourcePlaces.features.filter((place) => place.properties.id !== selectedId),
  };
}

function getLabelFilter(selectedId: string | null, anchored = false): FilterSpecification {
  const filter: FilterSpecification = [
    "all",
    ["!", ["has", "point_count"]],
    ["!=", ["get", "id"], selectedId ?? ""],
  ];
  if (anchored) {
    filter.push(["!=", ["get", "visible"], 0]);
  }

  return filter;
}

function getPlacedLabelFilter(
  selectedId: string | null,
  ids: readonly string[],
  anchored = false,
): FilterSpecification {
  const filter: FilterSpecification = [
    "all",
    ["!", ["has", "point_count"]],
    ["!=", ["get", "id"], selectedId ?? ""],
    ["in", ["get", "id"], ["literal", [...ids]]],
  ];
  if (anchored) {
    filter.push(["!=", ["get", "visible"], 0]);
  }

  return filter;
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
  clusterAnchorPlaces,
  expanded: controlledExpanded,
  focusSelectedId = null,
  frameKey,
  initialViewport = null,
  onViewportChange,
  onExpandedChange,
  id,
  inactive = false,
  geometry = EMPTY_MAP_GEOMETRY,
  onSelect,
  places: allPlaces,
  orderPlaces,
  recenterLabel = "Recenter on Kyoto",
  searchResultsMode = false,
  selectedId,
  showLocate = true,
  showDayOrder = true,
  variant = "planner",
}: TripMapProps): React.JSX.Element {
  const [selectedMarkerMode, setMarkerMode] = useState<"places" | "order">("places");
  const markerMode = searchResultsMode ? "places" : selectedMarkerMode;
  const places = markerMode === "order" ? orderPlaces : allPlaces;
  const anchored = clusterAnchorPlaces !== undefined && markerMode === "places";
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomInsetRef = useRef(bottomInset);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placesRef = useRef(places);
  const clusterAnchorPlacesRef = useRef(clusterAnchorPlaces);
  const lastFrameKeyRef = useRef(frameKey);
  const lastMarkerModeRef = useRef(markerMode);
  const selectRef = useRef(onSelect);
  const geometryRef = useRef(geometry);
  const selectedIdRef = useRef(selectedId);
  const focusSelectedIdRef = useRef(focusSelectedId);
  const initialViewportRef = useRef(initialViewport);
  const viewportChangeRef = useRef(onViewportChange);
  const skippedRestoredFrameRef = useRef(false);
  const syncLabelPlacementRef = useRef<() => void>(() => undefined);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const statusRef = useRef<MapStatus>(status);

  placesRef.current = places;
  clusterAnchorPlacesRef.current = clusterAnchorPlaces;
  selectRef.current = onSelect;
  geometryRef.current = geometry;
  selectedIdRef.current = selectedId;
  focusSelectedIdRef.current = focusSelectedId;
  viewportChangeRef.current = onViewportChange;
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
    let labelPlacementFrame: number | undefined;
    let labelPlacements: MapDiagnosticsSnapshot["labelPlacements"] = {
      leftIds: [],
      rightIds: [],
      selectedSide: null,
    };
    let disposed = false;
    let failed = false;
    const externalPhotoMarkers = new Map<string, Marker>();
    const failedExternalPhotos = new Set<string>();
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
        center: initialViewportRef.current
          ? [initialViewportRef.current.longitude, initialViewportRef.current.latitude]
          : [KYOTO_CENTER[0], KYOTO_CENTER[1]],
        zoom: initialViewportRef.current?.zoom ?? 13.4,
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
    const focusFirstPlace = (): void => {
      const coordinates = placesRef.current.features[0]?.geometry.coordinates;
      const longitude = coordinates?.[0];
      const latitude = coordinates?.[1];
      if (longitude !== undefined && latitude !== undefined) {
        activeMap.jumpTo({ center: [longitude, latitude], zoom: 15.1 });
      }
    };
    const readDiagnostics = (): MapDiagnosticsSnapshot => {
      const source = getSource(activeMap);
      const sourceOptions = source?.serialize();
      const geometrySource = getGeometrySource(activeMap);
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
      const selectedFeature = placesRef.current.features.find(
        (place) => place.properties.id === selectedIdRef.current,
      );
      const projectedSelected = selectedFeature
        ? activeMap.project([
            selectedFeature.geometry.coordinates[0] ?? 0,
            selectedFeature.geometry.coordinates[1] ?? 0,
          ])
        : null;

      return {
        center: { latitude: center.lat, longitude: center.lng },
        clusterLayerReady: activeMap.getLayer(CLUSTER_LAYER_ID) !== undefined,
        clusteringEnabled: sourceOptions?.cluster === true,
        markerMode,
        labelPlacements,
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
                .queryRenderedFeatures({
                  layers: [LABEL_LAYER_ID, LEFT_LABEL_LAYER_ID, SELECTED_LABEL_LAYER_ID],
                })
                .map((feature) => ({
                  id: String(feature.properties.id),
                  name: String(feature.properties.name),
                  label: getMapLabel(String(feature.properties.name)),
                })),
        renderedPlaces:
          activeMap.getLayer(SYMBOL_LAYER_ID) === undefined
            ? []
            : activeMap.queryRenderedFeatures({ layers: [SYMBOL_LAYER_ID] }).flatMap((feature) =>
                feature.geometry.type === "Point"
                  ? [
                      {
                        id: String(feature.properties.id),
                        ...activeMap.project(feature.geometry.coordinates as [number, number]),
                      },
                    ]
                  : [],
              ),
        numberedPlaces:
          markerMode === "order"
            ? placesRef.current.features.map((feature) => ({
                id: feature.properties.id,
                marker: feature.properties.marker ?? "",
              }))
            : [],
        featureCount:
          source === null
            ? null
            : !anchored
              ? getSourceFeatureCount(source)
              : placesRef.current.features.length -
                Number(
                  markerMode === "places" &&
                    placesRef.current.features.some(
                      (place) => place.properties.id === selectedIdRef.current,
                    ),
                ),
        geometryFeatureCount:
          geometrySource === null ? null : getSourceFeatureCount(geometrySource),
        firstClusterPoint:
          firstCluster === undefined ? null : { x: firstCluster.x, y: firstCluster.y },
        moving: activeMap.isMoving(),
        renderedClusterCount: clusters.length,
        renderedClusterLabels: clusters.map((cluster) =>
          String(
            !anchored
              ? cluster.properties.point_count_abbreviated
              : cluster.properties.visible_count,
          ),
        ),
        renderedSelectedIds:
          activeMap.getLayer(SELECTED_LAYER_ID) === undefined
            ? []
            : activeMap
                .queryRenderedFeatures({ layers: [SELECTED_LAYER_ID] })
                .map((feature) => String(feature.properties.id)),
        selectedPoint: projectedSelected
          ? { x: projectedSelected.x, y: projectedSelected.y }
          : null,
        sourceId: POINT_SOURCE_ID,
        sourceLoaded: source !== null && activeMap.isSourceLoaded(POINT_SOURCE_ID),
        status: statusRef.current,
        zoom: activeMap.getZoom(),
      };
    };

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      diagnosticsWindow.__urouteMapDiagnostics = readDiagnostics;
      diagnosticsWindow.__urouteMapFocusFirstPlace = focusFirstPlace;
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
        {
          layers: [
            SELECTED_LAYER_ID,
            SYMBOL_LAYER_ID,
            SELECTED_LABEL_LAYER_ID,
            LABEL_LAYER_ID,
            LEFT_LABEL_LAYER_ID,
          ],
        },
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

    function syncExternalPhotoMarkers(): void {
      if (
        !layersReady ||
        activeMap.getLayer(SYMBOL_LAYER_ID) === undefined ||
        activeMap.getLayer(SELECTED_LAYER_ID) === undefined
      ) {
        return;
      }
      const visibleIds = new Set<string>();
      const features =
        markerMode === "places"
          ? activeMap.queryRenderedFeatures({ layers: [SYMBOL_LAYER_ID, SELECTED_LAYER_ID] })
          : [];
      for (const feature of features) {
        const id: unknown = feature.properties.id;
        const image: unknown = feature.properties.image;
        if (
          typeof id !== "string" ||
          typeof image !== "string" ||
          !image.startsWith("https://mymaps.usercontent.google.com/hostedimage/") ||
          failedExternalPhotos.has(image) ||
          feature.geometry.type !== "Point"
        ) {
          continue;
        }
        visibleIds.add(id);
        if (externalPhotoMarkers.has(id)) {
          continue;
        }
        const photo = document.createElement("img");
        photo.className = searchResultsMode
          ? "trip-map__external-photo trip-map__external-photo--search-result"
          : "trip-map__external-photo";
        photo.src = image;
        photo.alt = "";
        photo.draggable = false;
        photo.onerror = () => {
          failedExternalPhotos.add(image);
          externalPhotoMarkers.get(id)?.remove();
          externalPhotoMarkers.delete(id);
        };
        const marker = new Marker({ element: photo, anchor: "center" })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .addTo(activeMap);
        externalPhotoMarkers.set(id, marker);
      }
      for (const [id, marker] of externalPhotoMarkers) {
        if (!visibleIds.has(id)) {
          marker.remove();
          externalPhotoMarkers.delete(id);
        }
      }
    }

    function applySelection(): void {
      syncSelectedPlace(activeMap, placesRef.current, selectedIdRef.current);
    }

    let placementKey = "";
    function syncLabelPlacement(): void {
      if (
        activeMap.isMoving() ||
        !layersReady ||
        activeMap.getLayer(LABEL_LAYER_ID) === undefined ||
        activeMap.getLayer(LEFT_LABEL_LAYER_ID) === undefined
      ) {
        return;
      }

      const canvas = activeMap.getCanvas();
      const centerX = canvas.clientWidth / 2;
      const centerY = canvas.clientHeight / 2;
      const seenIds = new Set<string>();
      const points = activeMap
        .queryRenderedFeatures({ layers: [SELECTED_LAYER_ID, SYMBOL_LAYER_ID] })
        .flatMap((feature): MapLabelPoint[] => {
          const featureId: unknown = feature.properties.id;
          if (
            typeof featureId !== "string" ||
            seenIds.has(featureId) ||
            feature.geometry.type !== "Point"
          ) {
            return [];
          }
          seenIds.add(featureId);
          const point = activeMap.project(feature.geometry.coordinates as [number, number]);

          return [
            {
              id: featureId,
              width: getMapLabelWidth(String(feature.properties.name)),
              x: point.x,
              y: point.y,
            },
          ];
        });
      points.sort((first, second) => {
        const firstSelected = first.id === selectedIdRef.current;
        const secondSelected = second.id === selectedIdRef.current;
        if (firstSelected !== secondSelected) {
          return firstSelected ? -1 : 1;
        }

        return (
          Math.hypot(first.x - centerX, first.y - centerY) -
            Math.hypot(second.x - centerX, second.y - centerY) || first.id.localeCompare(second.id)
        );
      });

      const placements = placeMapLabels(points, {
        height: canvas.clientHeight,
        width: canvas.clientWidth,
      });
      const rightIds: string[] = [];
      const leftIds: string[] = [];
      let selectedSide: MapLabelSide | undefined;
      placements.forEach((side, placeId) => {
        if (placeId === selectedIdRef.current) {
          selectedSide = side;
        } else if (side === "right") {
          rightIds.push(placeId);
        } else {
          leftIds.push(placeId);
        }
      });
      rightIds.sort();
      leftIds.sort();
      labelPlacements = { leftIds, rightIds, selectedSide: selectedSide ?? null };
      const nextPlacementKey = `${selectedSide ?? "hidden"}|${rightIds.join(",")}|${leftIds.join(",")}`;
      if (nextPlacementKey === placementKey) {
        return;
      }
      placementKey = nextPlacementKey;
      activeMap.setFilter(
        LABEL_LAYER_ID,
        getPlacedLabelFilter(selectedIdRef.current, rightIds, anchored),
      );
      activeMap.setFilter(
        LEFT_LABEL_LAYER_ID,
        getPlacedLabelFilter(selectedIdRef.current, leftIds, anchored),
      );
      activeMap.setLayoutProperty(
        SELECTED_LABEL_LAYER_ID,
        "visibility",
        selectedSide === undefined ? "none" : "visible",
      );
      if (selectedSide !== undefined) {
        activeMap.setLayoutProperty(
          SELECTED_LABEL_LAYER_ID,
          "icon-anchor",
          selectedSide === "right" ? "left" : "right",
        );
        activeMap.setLayoutProperty(
          SELECTED_LABEL_LAYER_ID,
          "icon-offset",
          selectedSide === "right" ? RIGHT_LABEL_OFFSET : LEFT_LABEL_OFFSET,
        );
      }
    }
    syncLabelPlacementRef.current = syncLabelPlacement;

    function scheduleLabelPlacement(): void {
      if (labelPlacementFrame !== undefined) {
        window.cancelAnimationFrame(labelPlacementFrame);
      }
      labelPlacementFrame = window.requestAnimationFrame(() => {
        labelPlacementFrame = undefined;
        syncLabelPlacement();
      });
    }

    function handleStyleLoad(): void {
      if (layersReady) {
        return;
      }

      try {
        activeMap.addSource(GEOMETRY_SOURCE_ID, {
          type: "geojson",
          data: geometryRef.current,
          promoteId: "id",
        });
        activeMap.addLayer({
          id: AREA_FILL_LAYER_ID,
          type: "fill",
          source: GEOMETRY_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": "#1677ff",
            "fill-opacity": 0.14,
          },
        });
        activeMap.addLayer({
          id: AREA_OUTLINE_LAYER_ID,
          type: "line",
          source: GEOMETRY_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": "#1677ff",
            "line-opacity": 0.8,
            "line-width": 2,
          },
        });
        activeMap.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: GEOMETRY_SOURCE_ID,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": "#1677ff",
            "line-opacity": 0.78,
            "line-width": 3,
          },
        });
        activeMap.addSource(POINT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: markerMode === "places" && !searchResultsMode,
          clusterMaxZoom: 14,
          clusterRadius: 24,
          ...(anchored ? { clusterProperties: { visible_count: ["+", ["get", "visible"]] } } : {}),
          promoteId: "id",
        });
        activeMap.addLayer({
          id: CLUSTER_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: !anchored
            ? ["has", "point_count"]
            : ["all", ["has", "point_count"], [">", ["get", "visible_count"], 0]],
          layout: {
            "icon-image": [
              "concat",
              "cluster-",
              !anchored
                ? ["to-string", ["get", "point_count_abbreviated"]]
                : ["to-string", ["get", "visible_count"]],
            ],
            "icon-allow-overlap": true,
          },
        });
        activeMap.addLayer({
          id: SYMBOL_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: !anchored
            ? ["!", ["has", "point_count"]]
            : ["all", ["!", ["has", "point_count"]], ["!=", ["get", "visible"], 0]],
          layout: {
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
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
          filter: getLabelFilter(selectedIdRef.current, anchored),
          layout: {
            "icon-image": ["concat", "name-", ["get", "name"]],
            "icon-anchor": "left",
            "icon-offset": RIGHT_LABEL_OFFSET,
            "icon-padding": 0,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        activeMap.addLayer({
          id: LEFT_LABEL_LAYER_ID,
          type: "symbol",
          source: POINT_SOURCE_ID,
          filter: getPlacedLabelFilter(selectedIdRef.current, [], anchored),
          layout: {
            "icon-image": ["concat", "name-", ["get", "name"]],
            "icon-anchor": "right",
            "icon-offset": LEFT_LABEL_OFFSET,
            "icon-padding": 0,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        activeMap.addLayer({
          id: SELECTED_LABEL_LAYER_ID,
          type: "symbol",
          source: SELECTED_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "name-", ["get", "name"]],
            "icon-anchor": "left",
            "icon-offset": RIGHT_LABEL_OFFSET,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        activeMap.moveLayer(LABEL_LAYER_ID, SYMBOL_LAYER_ID);
        activeMap.moveLayer(LEFT_LABEL_LAYER_ID, SYMBOL_LAYER_ID);
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
          .setData(
            getSourcePlaces(
              placesRef.current,
              selectedIdRef.current,
              markerMode,
              clusterAnchorPlacesRef.current,
            ),
          )
          .then(() => {
            if (!disposed) {
              applySelection();
              if (
                initialViewportRef.current === null &&
                (!searchResultsMode || placesRef.current.features.length > 0)
              ) {
                framePlaces(
                  activeMap,
                  placesRef.current,
                  false,
                  bottomInsetRef.current,
                  geometryRef.current,
                );
              }
              focusMapPlace(
                activeMap,
                placesRef.current,
                focusSelectedIdRef.current,
                bottomInsetRef.current,
                false,
              );
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
        searchResultsMode,
      );
      if (!disposed && !activeMap.hasImage(imageId)) {
        activeMap.addImage(imageId, sprite, { pixelRatio: 2 });
      }
    });
    activeMap.on("error", handleMapError);
    activeMap.on("style.load", handleStyleLoad);
    activeMap.on("render", finishReady);
    activeMap.on("render", scheduleLabelPlacement);
    activeMap.on("moveend", scheduleLabelPlacement);
    const reportViewport = (): void => {
      const center = activeMap.getCenter();
      viewportChangeRef.current?.({
        latitude: center.lat,
        longitude: center.lng,
        zoom: activeMap.getZoom(),
      });
    };
    activeMap.on("moveend", reportViewport);
    activeMap.on("idle", scheduleLabelPlacement);
    activeMap.on("idle", syncExternalPhotoMarkers);
    activeMap.once("idle", finishReady);
    tileTimer.id = window.setTimeout(() => {
      showError("Map tiles took too long to load. Try again when the connection is stable.");
    }, TILE_TIMEOUT_MS);

    const resizeObserver = new ResizeObserver(() => {
      activeMap.resize();
    });
    resizeObserver.observe(container);

    return () => {
      reportViewport();
      disposed = true;
      if (tileTimer.id !== undefined) {
        window.clearTimeout(tileTimer.id);
      }

      resizeObserver.disconnect();
      activeMap.off("error", handleMapError);
      activeMap.off("style.load", handleStyleLoad);
      activeMap.off("render", finishReady);
      activeMap.off("render", scheduleLabelPlacement);
      activeMap.off("moveend", scheduleLabelPlacement);
      activeMap.off("moveend", reportViewport);
      activeMap.off("idle", scheduleLabelPlacement);
      activeMap.off("idle", syncExternalPhotoMarkers);
      activeMap.off("idle", finishReady);
      for (const marker of externalPhotoMarkers.values()) {
        marker.remove();
      }
      if (labelPlacementFrame !== undefined) {
        window.cancelAnimationFrame(labelPlacementFrame);
      }

      if (layersReady) {
        activeMap.off("click", handlePointClick);
        activeMap.off("mouseenter", SYMBOL_LAYER_ID, handleMouseEnter);
        activeMap.off("mouseleave", SYMBOL_LAYER_ID, handleMouseLeave);
      }

      mapRef.current = null;
      if (syncLabelPlacementRef.current === syncLabelPlacement) {
        syncLabelPlacementRef.current = () => undefined;
      }
      if (diagnosticsWindow.__urouteMapDiagnostics === readDiagnostics) {
        delete diagnosticsWindow.__urouteMapDiagnostics;
      }
      if (diagnosticsWindow.__urouteMapFocusFirstPlace === focusFirstPlace) {
        delete diagnosticsWindow.__urouteMapFocusFirstPlace;
      }
      activeMap.remove();
    };
  }, [retryCount, markerMode, anchored, searchResultsMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (map === null) {
      return;
    }

    const source = getSource(map);

    if (source === null) {
      return;
    }

    const shouldFrame =
      frameKey === undefined ||
      frameKey !== lastFrameKeyRef.current ||
      markerMode !== lastMarkerModeRef.current;
    lastFrameKeyRef.current = frameKey;
    lastMarkerModeRef.current = markerMode;

    void source
      .setData(getSourcePlaces(places, selectedIdRef.current, markerMode, clusterAnchorPlaces))
      .then(() => {
        if (mapRef.current === map) {
          syncSelectedPlace(map, places, selectedIdRef.current);
          if (
            shouldFrame &&
            initialViewportRef.current !== null &&
            !skippedRestoredFrameRef.current
          ) {
            skippedRestoredFrameRef.current = true;
          } else if (shouldFrame) {
            if (!searchResultsMode || places.features.length > 0) {
              framePlaces(map, places, true, bottomInsetRef.current, geometryRef.current);
            }
          }
          if (shouldFrame) {
            focusMapPlace(map, places, focusSelectedIdRef.current, bottomInsetRef.current, true);
          }
          map.triggerRepaint();
        }
      })
      .catch(() => {
        if (mapRef.current === map) {
          setErrorMessage("The map places could not be loaded. Try loading the map again.");
          setStatus("error");
        }
      });
  }, [clusterAnchorPlaces, frameKey, markerMode, places, searchResultsMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (map === null) {
      return;
    }
    const source = getGeometrySource(map);
    if (source === null) {
      return;
    }
    void source
      .setData(geometry)
      .then(() => {
        if (mapRef.current === map) {
          if (frameKey === undefined && placesRef.current.features.length === 0) {
            framePlaces(map, placesRef.current, true, bottomInsetRef.current, geometry);
          }
          map.triggerRepaint();
        }
      })
      .catch(() => {
        if (mapRef.current === map) {
          setErrorMessage(
            "The imported map geometry could not be loaded. Try loading the map again.",
          );
          setStatus("error");
        }
      });
  }, [frameKey, geometry]);

  useEffect(() => {
    const map = mapRef.current;

    if (map === null || getSource(map) === null) {
      return;
    }

    const source = getSource(map);
    if (source !== null) {
      void source
        .setData(
          getSourcePlaces(
            placesRef.current,
            selectedId,
            markerMode,
            clusterAnchorPlacesRef.current,
          ),
        )
        .then(() => map.triggerRepaint())
        .catch(() => {
          if (mapRef.current === map) {
            setErrorMessage("The map places could not be updated. Try loading the map again.");
            setStatus("error");
          }
        });
    }
    syncSelectedPlace(map, placesRef.current, selectedId);
    map.triggerRepaint();
  }, [markerMode, selectedId]);

  useEffect(() => {
    if (focusSelectedId === null) {
      return;
    }
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    focusMapPlace(map, placesRef.current, focusSelectedId, bottomInset, true);
  }, [bottomInset, focusSelectedId]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      mapRef.current?.resize();
      syncLabelPlacementRef.current();
    });
  }, [expanded, inactive]);

  function retry(): void {
    setErrorMessage("");
    setStatus("loading");
    setRetryCount((current) => current + 1);
  }

  function recenter(): void {
    const map = mapRef.current;

    if (map !== null) {
      framePlaces(map, placesRef.current, true, bottomInsetRef.current, geometryRef.current);
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

      {showDayOrder ? (
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
      ) : null}
      {showDayOrder && markerMode === "order" && places.features.length === 0 ? (
        <p className="trip-map__empty-order">No stops planned for this day</p>
      ) : null}
      <div aria-label="Map controls" className="trip-map__controls" role="group">
        {showLocate ? (
          <button
            aria-label={recenterLabel}
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

      {status === "loading" ? <MapLoading /> : null}

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

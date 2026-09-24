import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileUp,
  Layers,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { attachContentSheetDrag } from "../places/content-sheet-drag";
import { PlaceCategoryIcon } from "../places/PlaceCategoryIcon";
import {
  categoryFromKmlStyle,
  effectivePlaceCategory,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "../places/place-category";
import "../places/map-search.css";
import {
  MIN_VISIBLE_MAP_CONTROLS_TOP,
  getDragOffset,
  getSheetOffset,
  resolveSheetSnap,
  type SheetSnap,
} from "../places/place-sheet-geometry";
import type { MapGeometryCollection, PlaceCollection } from "../plan/map-data";
import { MapLoading } from "../plan/MapLoading";
import { TripMap, type MapViewport } from "../plan/TripMap";
import { selectSearchMapItems } from "../plan/search-map-places";
import { addPlaceToKyotoDay } from "../plan/plan-store";
import { toggleSavedPlace, useSavedPlaceIds } from "../saved/saved-store";
import { ImportLayerMenu } from "./ImportLayerMenu";
import { ImportedPlaceGallery } from "./ImportedPlaceGallery";
import { MapPlanForm } from "./MapPlanForm";
import { displayImportedImageUrl, importedPlaceImages, isImageMediaUrl } from "./import-media";
import {
  findLinkedOsmPhoto,
  loadOsmPhotoCache,
  saveOsmPhotoCache,
  type OsmPhotoCache,
} from "./osm-photo";
import {
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
  saveImportedPlaceCategory,
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

function toMapPlaces(
  points: readonly ImportedPoint[],
  numbered = false,
  linkedPhotos: OsmPhotoCache = {},
): PlaceCollection {
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
        ...(numbered ? { marker: `place-${index + 1}` } : {}),
        synthetic: false,
      },
    })),
  };
}

function SearchPlaceThumbnail({ point }: { point: ImportedPoint }): React.JSX.Element {
  const imageUrl = displayImportedImageUrl(importedPlaceImages(point)[0]);
  const elementRef = useRef<HTMLSpanElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (imageUrl === undefined || nearViewport) {
      return;
    }
    const element = elementRef.current;

    if (element === null || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);

      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { root: element.closest(".imported-page__search-screen"), rootMargin: "64px 0px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [imageUrl, nearViewport]);

  return (
    <span aria-hidden="true" className="imported-page__search-thumbnail" ref={elementRef}>
      {imageUrl !== undefined && nearViewport && !imageFailed ? (
        <img
          alt=""
          decoding="async"
          fetchPriority="low"
          loading="lazy"
          onError={() => setImageFailed(true)}
          src={imageUrl}
        />
      ) : (
        <MapPin size={20} />
      )}
    </span>
  );
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

function importedPlaceHeading(point: ImportedPoint): { title: string; subtitle: string } {
  const match = /^\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/.exec(point.name);
  const folder = point.folder.trim();

  return {
    title: match?.[2] ?? point.name,
    subtitle: [match?.[1], folder === "Unfiled" ? "" : folder].filter(Boolean).join(" · "),
  };
}

const RECENT_SEARCHES_KEY = "uroute-map-searches:v1";
const MAPS_STATE_KEY = "uroute-maps-state:v1";

interface MapsState {
  draftQuery: string;
  folder: string;
  layersOpen: boolean;
  query: string;
  searchEditing: boolean;
  searchOpen: boolean;
  searchWasOpen: boolean;
  selectedId: string | null;
  sheetCollapsed: boolean;
  sheetExpanded: boolean;
  sheetScrollTop: number;
  viewport: MapViewport | null;
  visibleLimit: number;
}

function loadMapsState(): Partial<MapsState> {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(MAPS_STATE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) {
      return {};
    }
    const state = stored as Partial<MapsState>;
    const viewport = state.viewport;

    return {
      draftQuery: typeof state.draftQuery === "string" ? state.draftQuery : "",
      folder: typeof state.folder === "string" ? state.folder : "All folders",
      layersOpen: state.layersOpen === true,
      query: typeof state.query === "string" ? state.query : "",
      searchEditing: state.searchEditing === true,
      searchOpen: state.searchOpen === true,
      searchWasOpen: state.searchWasOpen === true,
      selectedId: typeof state.selectedId === "string" ? state.selectedId : null,
      sheetCollapsed: state.sheetCollapsed === true,
      sheetExpanded: state.sheetExpanded === true && state.sheetCollapsed !== true,
      sheetScrollTop: typeof state.sheetScrollTop === "number" ? state.sheetScrollTop : 0,
      viewport:
        viewport !== null &&
        typeof viewport === "object" &&
        Number.isFinite(viewport.latitude) &&
        Number.isFinite(viewport.longitude) &&
        Number.isFinite(viewport.zoom)
          ? viewport
          : null,
      visibleLimit: typeof state.visibleLimit === "number" ? state.visibleLimit : 24,
    };
  } catch {
    return {};
  }
}

function persistMapsSheetScroll(top: number): void {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(MAPS_STATE_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      sessionStorage.setItem(MAPS_STATE_KEY, JSON.stringify({ ...saved, sheetScrollTop: top }));
    }
  } catch {
    // Scrolling still works when browser storage is unavailable.
  }
}

function persistMapsViewport(viewport: MapViewport): void {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(MAPS_STATE_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      sessionStorage.setItem(MAPS_STATE_KEY, JSON.stringify({ ...saved, viewport }));
    }
  } catch {
    // The map remains usable when browser storage is unavailable.
  }
}

function loadRecentSearches(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");

    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export function ImportedPlacesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const addRouteOpen = useRouterState({
    select: (state) => state.location.pathname === "/maps" && state.location.search.add === "open",
  });
  const globalMaps = window.location.pathname === "/maps";
  const requested = new URLSearchParams(window.location.search);
  const [savedMapsState] = useState<Partial<MapsState>>(() => (globalMaps ? loadMapsState() : {}));
  const layersButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWasOpenRef = useRef(savedMapsState.searchWasOpen ?? false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState<ImportedPoint[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [geometries, setGeometries] = useState<ImportedGeometry[]>([]);
  const [visits, setVisits] = useState<ImportedVisit[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    requested.get("place") ?? savedMapsState.selectedId ?? null,
  );
  const previousSelectedIdRef = useRef(selectedId);
  const [focusSelectedId, setFocusSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(savedMapsState.viewport ?? null);
  const [searchOrigin, setSearchOrigin] = useState<MapViewport | null>(
    savedMapsState.viewport ?? null,
  );
  const [searchDraftOrigin, setSearchDraftOrigin] = useState<MapViewport | null>(
    savedMapsState.viewport ?? null,
  );
  const [sheetHeight, setSheetHeight] = useState(0);
  const [sheetViewportHeight, setSheetViewportHeight] = useState(window.innerHeight);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const sheetDragMovedRef = useRef(false);
  const sheetDragStartRef = useRef<number | null>(null);
  const sheetDragStartedAtRef = useRef(0);
  const addOpenedHereRef = useRef(false);
  const addWasOpenRef = useRef(false);
  const addPreviousScrollRef = useRef(0);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(savedMapsState.sheetCollapsed ?? false);
  const [sheetExpanded, setSheetExpanded] = useState(savedMapsState.sheetExpanded ?? false);
  const sheetScrollTopRef = useRef(savedMapsState.sheetScrollTop ?? 0);
  const [destination, setDestination] = useState<MapDestination | null>(() => {
    const requestedDestination = { trip: requested.get("trip"), day: requested.get("day") };

    return isMapDestination(requestedDestination) ? requestedDestination : loadMapDestination();
  });
  const [selectedDay, setSelectedDay] = useState<KantoDay>(KANTO_DAYS[0].date);
  const [folder, setFolder] = useState(savedMapsState.folder ?? "All folders");
  const [query, setQuery] = useState(savedMapsState.query ?? "");
  const [draftQuery, setDraftQuery] = useState(savedMapsState.draftQuery ?? "");
  const [searchEditing, setSearchEditing] = useState(savedMapsState.searchEditing ?? false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const [searchOpen, setSearchOpen] = useState(savedMapsState.searchOpen ?? false);
  const [visibleLimit, setVisibleLimit] = useState(savedMapsState.visibleLimit ?? 24);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [view, setView] = useState<"places" | "plan">("places");
  const [layersOpen, setLayersOpen] = useState(savedMapsState.layersOpen ?? false);
  const [hiddenLayers, setHiddenLayers] = useState(loadHiddenImportLayers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [osmPhotoCache, setOsmPhotoCache] = useState(loadOsmPhotoCache);
  const [photoLookupLoading, setPhotoLookupLoading] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const addSelectionRef = useRef(selectedId);

  useEffect(() => {
    if (addSelectionRef.current === selectedId) {
      return;
    }
    addSelectionRef.current = selectedId;
    setDestinationOpen(false);
    if (globalMaps && addRouteOpen) {
      void navigate({
        to: "/maps",
        search: {
          ...(destination === null ? {} : { trip: destination.trip, day: destination.day }),
          ...(selectedId === null ? {} : { place: selectedId }),
        },
        replace: true,
        resetScroll: false,
      });
    }
    // Selection changes close the add mode; opening add mode does not change selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (globalMaps) {
      setDestinationOpen(addRouteOpen);
      if (!addRouteOpen) {
        addOpenedHereRef.current = false;
      }
    }
  }, [addRouteOpen, globalMaps]);

  useEffect(() => {
    if (destinationOpen) {
      addWasOpenRef.current = true;
    } else if (addWasOpenRef.current) {
      addWasOpenRef.current = false;
      window.requestAnimationFrame(() => {
        sheetRef.current?.scrollTo({ top: addPreviousScrollRef.current });
        addButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [destinationOpen]);

  function openAddPanel(): void {
    addPreviousScrollRef.current = sheetRef.current?.scrollTop ?? 0;
    if (destination === null) {
      setDestination({ trip: "kyoto", day: "2026-11-13" });
    }
    setDestinationOpen(true);
    setSheetCollapsed(false);
    sheetRef.current?.scrollTo({ top: 0 });
    if (globalMaps && !addRouteOpen) {
      addOpenedHereRef.current = true;
      void navigate({
        to: "/maps",
        search: {
          ...(destination === null ? {} : { trip: destination.trip, day: destination.day }),
          ...(selectedId === null ? {} : { place: selectedId }),
          add: "open",
        },
        resetScroll: false,
      });
    }
  }

  function closeAddPanel(): void {
    setDestinationOpen(false);
    if (!globalMaps || !addRouteOpen) {
      return;
    }
    if (addOpenedHereRef.current) {
      window.history.back();
    } else {
      void navigate({
        to: "/maps",
        search: {
          ...(destination === null ? {} : { trip: destination.trip, day: destination.day }),
          ...(selectedId === null ? {} : { place: selectedId }),
        },
        replace: true,
        resetScroll: false,
      });
    }
  }

  useEffect(() => {
    saveOsmPhotoCache(osmPhotoCache);
  }, [osmPhotoCache]);

  useEffect(() => {
    if (notice === "") {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(""), 4_000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadImportedPlaces(), loadImportedGeometries(), loadImportedVisits()])
      .then(([storedPlaces, storedGeometries, storedVisits]) => {
        if (active) {
          setPlaces(storedPlaces);
          setGeometries(storedGeometries);
          setVisits(storedVisits);
          setLibraryLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Imported places could not be read from this device.");
          setLibraryLoading(false);
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

  useEffect(() => {
    if (!globalMaps) {
      return;
    }
    try {
      sessionStorage.setItem(
        MAPS_STATE_KEY,
        JSON.stringify({
          draftQuery,
          folder,
          layersOpen,
          query,
          searchEditing,
          searchOpen,
          searchWasOpen: searchWasOpenRef.current,
          selectedId,
          sheetCollapsed,
          sheetExpanded,
          sheetScrollTop: sheetScrollTopRef.current,
          viewport,
          visibleLimit,
        } satisfies MapsState),
      );
    } catch {
      // Keep the current Maps view usable when browser storage is unavailable.
    }
  }, [
    draftQuery,
    folder,
    globalMaps,
    layersOpen,
    query,
    searchEditing,
    searchOpen,
    selectedId,
    sheetCollapsed,
    sheetExpanded,
    viewport,
    visibleLimit,
  ]);

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
  const normalizedDraft = draftQuery.trim().toLocaleLowerCase();
  const suggestedPlaces = useMemo(
    () =>
      normalizedDraft === ""
        ? []
        : selectSearchMapItems(
            places.filter(
              (place) =>
                isImportLayerVisible(place, hiddenLayers) &&
                `${place.name} ${place.folder}`.toLocaleLowerCase().includes(normalizedDraft),
            ),
            searchDraftOrigin,
            (place) => [place.longitude, place.latitude],
          ),
    [hiddenLayers, normalizedDraft, places, searchDraftOrigin],
  );
  const visiblePlaces = useMemo(
    () =>
      places.filter(
        (place) =>
          (globalMaps || folder === "All folders" || place.folder === folder) &&
          (normalizedQuery === "" ||
            `${place.name} ${place.folder}`.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [folder, globalMaps, normalizedQuery, places],
  );
  const visibleGeometries = useMemo(
    () =>
      geometries.filter(
        (item) =>
          (globalMaps || folder === "All folders" || item.folder === folder) &&
          (normalizedQuery === "" ||
            `${item.name} ${item.folder}`.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [folder, geometries, globalMaps, normalizedQuery],
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
  const selectedCategory =
    selectedPlace === undefined ? "unknown" : effectivePlaceCategory(selectedPlace);
  const savedPlaceIds = useSavedPlaceIds();
  const selectedHeading = selectedPlace === undefined ? null : importedPlaceHeading(selectedPlace);
  const sourceImages = selectedPlace === undefined ? [] : importedPlaceImages(selectedPlace);
  const selectedOsmPhoto =
    selectedPlace === undefined || sourceImages.length > 0
      ? null
      : (osmPhotoCache[selectedPlace.id]?.photo ?? null);
  const selectedImages =
    sourceImages.length > 0
      ? sourceImages
      : selectedOsmPhoto === null
        ? []
        : [selectedOsmPhoto.imageUrl];
  const selectedSourceLinks = (selectedPlace?.mediaReferences ?? []).filter(
    (url) => !isImageMediaUrl(url),
  );
  const sheetOpen = globalMaps && !searchEditing && (searchOpen || selectedPlace !== undefined);
  const detailSheet = globalMaps && selectedPlace !== undefined && !searchOpen;
  const sheetSnap: SheetSnap = sheetCollapsed ? "collapsed" : sheetExpanded ? "expanded" : "middle";
  const visibleSheetSnap = destinationOpen ? "expanded" : sheetSnap;
  const sheetBaseOffset = sheetOpen ? getSheetOffset(visibleSheetSnap, sheetViewportHeight) : 0;
  const mapControlsVisible =
    !sheetOpen || 72 + sheetBaseOffset + sheetDragOffset >= MIN_VISIBLE_MAP_CONTROLS_TOP;

  const settleSheet = useCallback(
    (delta: number, duration: number): void => {
      const next = resolveSheetSnap(sheetSnap, delta, duration, sheetViewportHeight);
      setSheetDragOffset(0);
      setSheetCollapsed(next === "collapsed");
      setSheetExpanded(next === "expanded");
      if (next !== "expanded") {
        const field = document.activeElement;
        if (field instanceof HTMLElement && sheetRef.current?.contains(field)) {
          field.blur();
        }
        sheetScrollTopRef.current = 0;
        persistMapsSheetScroll(0);
        sheetRef.current?.scrollTo({ top: 0 });
      }
    },
    [sheetSnap, sheetViewportHeight],
  );

  function startSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    if (!detailSheet || destinationOpen) {
      return;
    }
    const target = event.target as Element;
    const handle = target.closest(".imported-page__sheet-handle") !== null;
    if (
      !handle &&
      target.closest(
        "button, a, input, textarea, select, summary, label, [data-sheet-drag-ignore], [role='button'], [role='link'], [contenteditable='true']",
      ) !== null
    ) {
      return;
    }
    if (
      sheetSnap === "expanded" &&
      !handle &&
      target.closest(".imported-page__selected-header") === null
    ) {
      return;
    }
    event.preventDefault();
    sheetDragStartRef.current = event.clientY;
    sheetDragStartedAtRef.current = performance.now();
    sheetDragMovedRef.current = false;
    (handle ? target.closest("button")! : event.currentTarget).setPointerCapture(event.pointerId);
  }

  function moveSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    if (sheetDragStartRef.current === null) {
      return;
    }
    const delta = event.clientY - sheetDragStartRef.current;
    if (Math.abs(delta) > 6) {
      sheetDragMovedRef.current = true;
    }
    setSheetDragOffset(getDragOffset(sheetSnap, delta, sheetViewportHeight));
  }

  function finishSheetDrag(event: React.PointerEvent<HTMLElement>): void {
    if (sheetDragStartRef.current === null) {
      return;
    }
    const delta = event.clientY - sheetDragStartRef.current;
    sheetDragStartRef.current = null;
    settleSheet(delta, performance.now() - sheetDragStartedAtRef.current);
  }

  function cancelSheetDrag(): void {
    if (sheetDragStartRef.current === null) {
      return;
    }
    sheetDragStartRef.current = null;
    sheetDragMovedRef.current = false;
    setSheetDragOffset(0);
  }

  useEffect(() => {
    if (
      selectedPlace === undefined ||
      importedPlaceImages(selectedPlace).length > 0 ||
      Object.hasOwn(osmPhotoCache, selectedPlace.id)
    ) {
      setPhotoLookupLoading(false);

      return;
    }
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setPhotoLookupLoading(true);
    void findLinkedOsmPhoto(selectedPlace, controller.signal)
      .then((photo) => {
        if (active && !controller.signal.aborted) {
          setOsmPhotoCache((current) => ({
            ...current,
            [selectedPlace.id]: { checkedAt: Date.now(), photo },
          }));
        }
      })
      .catch(() => {
        // Leave the normal marker in place; retry if this place is opened again.
      })
      .finally(() => {
        if (active) {
          setPhotoLookupLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [selectedPlace, osmPhotoCache]);

  useEffect(() => {
    if (!globalMaps || sheetRef.current === null) {
      return;
    }
    const sheet = sheetRef.current;
    const observer = new ResizeObserver(() => {
      setSheetHeight(sheet.getBoundingClientRect().height);
      setSheetViewportHeight(sheet.parentElement?.clientHeight ?? window.innerHeight);
    });
    observer.observe(sheet);
    if (sheet.parentElement !== null) {
      observer.observe(sheet.parentElement);
    }

    return () => observer.disconnect();
  }, [globalMaps, places.length, geometries.length]);

  useEffect(() => {
    if (
      !globalMaps ||
      destinationOpen ||
      sheetRef.current === null ||
      (detailSheet && sheetSnap !== "expanded")
    ) {
      return;
    }

    const snap: SheetSnap = sheetCollapsed ? "collapsed" : sheetExpanded ? "expanded" : "middle";

    return attachContentSheetDrag(sheetRef.current, {
      onDrag: (delta) => {
        if (sheetDragStartRef.current === null) {
          setSheetDragOffset(getDragOffset(snap, delta, sheetViewportHeight));
        }
      },
      onRelease: (delta, duration) => {
        if (sheetDragStartRef.current !== null) {
          return;
        }
        setSheetDragOffset(0);
        sheetDragMovedRef.current = true;
        window.setTimeout(() => {
          sheetDragMovedRef.current = false;
        }, 0);
        settleSheet(delta, duration);
      },
      onCancel: () => setSheetDragOffset(0),
      allowUpwardFrom: (target) =>
        !detailSheet && target.closest(".imported-page__sheet-handle") !== null,
    });
  }, [
    globalMaps,
    destinationOpen,
    places.length,
    geometries.length,
    selectedPlace,
    searchOpen,
    sheetCollapsed,
    sheetExpanded,
    sheetViewportHeight,
    detailSheet,
    sheetSnap,
    settleSheet,
  ]);

  useEffect(() => {
    if (sheetOpen && sheetRef.current !== null && sheetScrollTopRef.current > 0) {
      sheetRef.current.scrollTop = sheetScrollTopRef.current;
    }
    // Restore saved scroll once after the sheet becomes visible.
  }, [sheetOpen]);
  const searchResultsMode =
    globalMaps && normalizedQuery !== "" && !searchEditing && selectedId === null;
  const clusterAnchorPlaces = useMemo(
    () =>
      searchResultsMode
        ? null
        : toMapPlaces(view === "plan" ? dayPlaces : visiblePlaces, false, osmPhotoCache),
    [dayPlaces, osmPhotoCache, searchResultsMode, view, visiblePlaces],
  );
  const mapDisplayPoints = useMemo(() => {
    const points = (view === "plan" ? dayPlaces : visiblePlaces).filter((point) =>
      isImportLayerVisible(point, hiddenLayers),
    );

    return searchResultsMode
      ? selectSearchMapItems(points, searchOrigin, (point) => [point.longitude, point.latitude])
      : points;
  }, [dayPlaces, hiddenLayers, searchOrigin, searchResultsMode, view, visiblePlaces]);
  const mapPlaces = useMemo(
    () => toMapPlaces(mapDisplayPoints, false, osmPhotoCache),
    [mapDisplayPoints, osmPhotoCache],
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
        osmPhotoCache,
      ),
    [dayPlaces, hiddenLayers, osmPhotoCache],
  );
  const displayedPlaces =
    view === "plan" ? dayPlaces : searchResultsMode ? mapDisplayPoints : visiblePlaces;
  const listedPlaces =
    globalMaps && searchResultsMode
      ? displayedPlaces
      : displayedPlaces.slice(0, view === "places" ? (globalMaps ? visibleLimit : 100) : undefined);
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
    if (!globalMaps && selectedId !== null) {
      selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (globalMaps && selectedId !== previousSelectedIdRef.current) {
      sheetScrollTopRef.current = 0;
      persistMapsSheetScroll(0);
      sheetRef.current?.scrollTo({ top: 0 });
    }
    previousSelectedIdRef.current = selectedId;
    setCategoryPickerOpen(false);
  }, [globalMaps, selectedId]);

  async function chooseCategory(categoryOverride: PlaceCategory | null): Promise<void> {
    if (selectedPlace === undefined || categorySaving) {
      return;
    }
    setCategorySaving(true);
    setError("");
    try {
      const updated = await saveImportedPlaceCategory(selectedPlace.id, categoryOverride);
      setPlaces((current) => current.map((point) => (point.id === updated.id ? updated : point)));
      setCategoryPickerOpen(false);
    } catch {
      setError("This category could not be saved on this device.");
    } finally {
      setCategorySaving(false);
    }
  }

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
      openAddPanel();

      return;
    }
    const target = globalMaps ? destination : { trip: "kanto" as const, day: selectedDay };
    if (target === null) {
      return;
    }
    setAddingToPlan(true);
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
      } else {
        closeAddPanel();
      }
    } catch {
      setError("This place could not be added to the plan on this device.");
    } finally {
      setAddingToPlan(false);
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

  function closeSearchEditing(): void {
    setDraftQuery(query);
    setSearchEditing(false);
    setSearchOpen(searchWasOpenRef.current);
    searchInputRef.current?.blur();
  }

  function submitSearch(value = draftQuery): void {
    const nextQuery = value.trim();
    setSearchOrigin(searchDraftOrigin);
    setDraftQuery(nextQuery);
    setQuery(nextQuery);
    setSearchEditing(false);
    setSearchOpen(true);
    setSelectedId(null);
    setFocusSelectedId(null);
    setSheetCollapsed(false);
    setVisibleLimit(24);
    searchInputRef.current?.blur();

    if (nextQuery !== "") {
      const nextRecent = [
        nextQuery,
        ...recentSearches.filter(
          (previous) => previous.toLocaleLowerCase() !== nextQuery.toLocaleLowerCase(),
        ),
      ].slice(0, 6);
      setRecentSearches(nextRecent);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
      } catch {
        // Search works for this session when storage is unavailable.
      }
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
          onFocus={() => {
            if (globalMaps && !searchEditing) {
              searchWasOpenRef.current = searchOpen;
              setSearchDraftOrigin(viewport);
              setDraftQuery(query);
              setSearchEditing(true);
              setSearchOpen(false);
            }
          }}
          onChange={(event) => {
            if (globalMaps) {
              setDraftQuery(event.target.value);
            } else {
              setQuery(event.target.value);
            }
            setVisibleLimit(24);
          }}
          onKeyDown={(event) => {
            if (globalMaps && event.key === "Enter") {
              event.preventDefault();
              submitSearch();
            } else if (globalMaps && event.key === "Escape") {
              closeSearchEditing();
            }
          }}
          placeholder="Search all imported places"
          ref={searchInputRef}
          type="search"
          value={globalMaps ? draftQuery : query}
        />
      </label>
      {globalMaps && draftQuery !== "" ? (
        <button
          aria-label="Clear search text"
          className="imported-page__search-clear"
          onClick={() => {
            setDraftQuery("");
            setQuery("");
            setSearchEditing(false);
            setSearchOpen(false);
            searchInputRef.current?.blur();
          }}
          type="button"
        >
          <X aria-hidden="true" size={15} strokeWidth={2} />
        </button>
      ) : null}
      {!globalMaps ? folderFilter : null}
    </div>
  );
  const layersButton = (
    <button
      aria-controls="import-map-layers"
      aria-expanded={layersOpen}
      aria-label="Map layers"
      className="imported-page__layers-button"
      disabled={!globalMaps && places.length === 0 && geometries.length === 0}
      onClick={() => setLayersOpen(true)}
      ref={layersButtonRef}
      type="button"
    >
      <Layers aria-hidden="true" size={21} />
    </button>
  );

  return (
    <section
      className={
        globalMaps
          ? `imported-page imported-page--maps${searchEditing ? " imported-page--searching" : ""}`
          : "imported-page"
      }
      data-swipe-back-ignore={globalMaps && destinationOpen ? "true" : undefined}
      onKeyDown={(event) => {
        if (globalMaps && destinationOpen && event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          closeAddPanel();
        }
      }}
    >
      <header className="imported-page__header">
        {globalMaps && searchEditing ? (
          <button
            aria-label="Close search"
            className="imported-page__search-back"
            onClick={closeSearchEditing}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={21} />
          </button>
        ) : null}
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
        {!globalMaps ? layersButton : null}
        {!globalMaps ? (
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
        ) : null}
      </header>

      {globalMaps && searchEditing ? (
        <section aria-label="Search suggestions" className="imported-page__search-screen">
          {normalizedDraft === "" ? (
            <>
              <h2>Recent</h2>
              {recentSearches.length === 0 ? null : (
                <div className="imported-page__search-list">
                  {recentSearches.map((recent) => (
                    <button key={recent} onClick={() => submitSearch(recent)} type="button">
                      <Clock3 aria-hidden="true" size={20} />
                      <span>{recent}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="imported-page__search-list">
                <button onClick={() => submitSearch()} type="button">
                  <Search aria-hidden="true" size={20} />
                  <span>Search “{draftQuery.trim()}” on map</span>
                </button>
                {suggestedPlaces.map((point) => (
                  <button
                    key={point.id}
                    onClick={() => {
                      submitSearch(point.name);
                      setSelectedId(point.id);
                      setFocusSelectedId(point.id);
                      setSheetCollapsed(false);
                      setSearchOpen(false);
                    }}
                    type="button"
                  >
                    <SearchPlaceThumbnail point={point} />
                    <span>
                      <strong>{point.name}</strong>
                      <small>{point.folder}</small>
                    </span>
                  </button>
                ))}
              </div>
              {suggestedPlaces.length === 0 ? (
                <p className="imported-page__search-empty">No matching imported places.</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <ImportLayerMenu
        hidden={hiddenLayers}
        onClose={closeLayers}
        onHideAll={() => setHiddenLayers((current) => hideAllImportLayers(current, layerSources))}
        {...(globalMaps
          ? {
              onImportFile: (file: File) => {
                setLayersOpen(false);
                void chooseFile(file);
              },
            }
          : {})}
        onShowAll={() => setHiddenLayers((current) => showAllImportLayers(current, layerSources))}
        onShowAllSource={(source) =>
          setHiddenLayers((current) => showAllImportLayers(current, [source]))
        }
        onToggle={toggleLayer}
        open={layersOpen && (globalMaps || layerSources.length > 0)}
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

      {globalMaps && libraryLoading ? (
        <div className="imported-page__library-loading">
          <MapLoading />
        </div>
      ) : places.length === 0 && geometries.length === 0 ? (
        <div className="imported-page__empty">
          <MapPin aria-hidden="true" size={30} />
          <h2>Bring your places onto the map</h2>
          <p>Import a KML or KMZ file, then add places to any trip day.</p>
          {globalMaps && destination !== null ? (
            <p className="imported-page__empty-target">Adding to {destinationLabel(destination)}</p>
          ) : null}
          {globalMaps ? (
            <button onClick={() => setLayersOpen(true)} type="button">
              Open map layers
            </button>
          ) : (
            <label htmlFor="import-kml-file">Choose a file</label>
          )}
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
          <div
            aria-hidden={globalMaps && searchEditing}
            className="imported-page__map"
            data-sheet-dragging={sheetDragOffset === 0 ? undefined : "true"}
            inert={globalMaps && searchEditing}
            style={
              globalMaps
                ? ({
                    "--import-map-bottom-inset": `${sheetOpen ? Math.max(0, sheetHeight - sheetBaseOffset - sheetDragOffset) : 0}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <TripMap
              key={searchResultsMode ? "maps-search-map" : "maps-map"}
              bottomInset={sheetOpen ? Math.max(0, sheetHeight - sheetBaseOffset) : 0}
              {...(clusterAnchorPlaces === null ? {} : { clusterAnchorPlaces })}
              focusSelectedId={searchResultsMode ? null : globalMaps ? focusSelectedId : null}
              frameKey={`${view}:${selectedDay}:${folder}:${normalizedQuery}:${places.length}:${geometries.length}`}
              geometry={mapGeometry}
              initialViewport={
                globalMaps
                  ? searchResultsMode && mapPlaces.features.length > 0
                    ? null
                    : viewport
                  : null
              }
              onSelect={(id) => {
                setSelectedId(id);
                setFocusSelectedId(id);
                setSheetCollapsed(false);
                setSearchOpen(false);
              }}
              onViewportChange={(next) => {
                setViewport(next);
                if (globalMaps) {
                  persistMapsViewport(next);
                }
              }}
              orderPlaces={orderPlaces}
              places={mapPlaces}
              recenterLabel={globalMaps ? "Recenter imported places" : "Recenter on Kyoto"}
              searchResultsMode={searchResultsMode}
              selectedId={searchResultsMode ? null : selectedId}
              showLocate={globalMaps && !destinationOpen && mapControlsVisible}
              showDayOrder={!globalMaps}
              variant="discovery"
            />
            {globalMaps && !searchEditing && !destinationOpen && mapControlsVisible
              ? layersButton
              : null}
          </div>
          <div
            data-dragging={sheetDragOffset === 0 ? undefined : "true"}
            className={`imported-page__content${globalMaps ? (sheetOpen ? " imported-page__content--open" : " imported-page__content--closed") : ""}${globalMaps && searchOpen ? " imported-page__content--results" : ""}${globalMaps && selectedPlace !== undefined && !searchOpen ? " imported-page__content--detail" : ""}${globalMaps && sheetCollapsed && selectedPlace !== undefined && !searchOpen && !destinationOpen ? " imported-page__content--collapsed" : ""}${globalMaps && (destinationOpen || (sheetExpanded && !sheetCollapsed)) ? " imported-page__content--expanded" : ""}${globalMaps && destinationOpen ? " imported-page__content--adding" : ""}`}
            onScroll={
              globalMaps
                ? (event) => {
                    sheetScrollTopRef.current = event.currentTarget.scrollTop;
                    persistMapsSheetScroll(event.currentTarget.scrollTop);
                  }
                : undefined
            }
            ref={sheetRef}
            onPointerDown={startSheetDrag}
            onPointerMove={moveSheetDrag}
            onPointerUp={finishSheetDrag}
            onPointerCancel={cancelSheetDrag}
            onLostPointerCapture={cancelSheetDrag}
            style={
              globalMaps && sheetOpen
                ? { transform: `translateY(${sheetBaseOffset + sheetDragOffset}px)` }
                : undefined
            }
          >
            {globalMaps && sheetOpen ? (
              <button
                aria-label={sheetExpanded ? "Collapse place details" : "Expand place details"}
                className="imported-page__sheet-handle"
                disabled={destinationOpen}
                onClick={() => {
                  if (sheetDragMovedRef.current) {
                    sheetDragMovedRef.current = false;

                    return;
                  }
                  if (sheetCollapsed) {
                    setSheetCollapsed(false);
                  } else {
                    setSheetExpanded(!sheetExpanded);
                  }
                }}
                type="button"
              />
            ) : null}
            {!globalMaps && view === "places" ? placeFilters : null}
            {!globalMaps ? (
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
                <header className="imported-page__selected-header">
                  <div>
                    <h2>{selectedHeading?.title}</h2>
                    {selectedHeading?.subtitle ? <p>{selectedHeading.subtitle}</p> : null}
                  </div>
                  {globalMaps ? (
                    <div className="imported-page__selected-actions">
                      <button
                        aria-label={
                          savedPlaceIds.has(selectedPlace.id)
                            ? "Remove from saved places"
                            : "Save place"
                        }
                        aria-pressed={savedPlaceIds.has(selectedPlace.id)}
                        className="imported-page__selected-save"
                        onClick={() => toggleSavedPlace(selectedPlace.id)}
                        type="button"
                      >
                        <Bookmark
                          aria-hidden="true"
                          fill={savedPlaceIds.has(selectedPlace.id) ? "currentColor" : "none"}
                          size={22}
                          strokeWidth={1.8}
                        />
                      </button>
                      <button
                        aria-label="Close place details"
                        className="imported-page__selected-close"
                        onClick={() => {
                          setSelectedId(null);
                          setFocusSelectedId(null);
                          setSheetCollapsed(false);
                          if (globalMaps && normalizedQuery !== "") {
                            setSearchOpen(true);
                          }
                        }}
                        type="button"
                      >
                        <X aria-hidden="true" size={18} />
                      </button>
                    </div>
                  ) : null}
                </header>
                {globalMaps && destinationOpen ? (
                  <MapPlanForm
                    destination={destination}
                    onDestination={setDestination}
                    onBack={closeAddPanel}
                    onAdd={() => void addToPlan(selectedPlace)}
                    pending={addingToPlan}
                  />
                ) : (
                  <>
                    <ImportedPlaceGallery
                      images={selectedImages}
                      key={selectedPlace.id}
                      name={selectedPlace.name}
                    />
                    {globalMaps ? (
                      <div className="imported-page__selected-quick-actions">
                        <button
                          aria-label="Add to plan"
                          aria-expanded={destinationOpen}
                          className="imported-page__selected-primary"
                          onClick={openAddPanel}
                          ref={addButtonRef}
                          type="button"
                        >
                          Add to trip
                        </button>
                        <a
                          aria-label={`Directions to ${selectedPlace.name} in Google Maps (opens another app or tab)`}
                          className="imported-page__selected-secondary"
                          href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.latitude},${selectedPlace.longitude}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Directions <ExternalLink aria-hidden="true" size={16} />
                        </a>
                      </div>
                    ) : null}
                    {photoLookupLoading && sourceImages.length === 0 ? (
                      <p className="imported-page__photo-credit">Checking for a linked photo…</p>
                    ) : null}
                    {selectedOsmPhoto !== null ? (
                      <p className="imported-page__photo-credit">
                        Photo: {selectedOsmPhoto.artist} ·{" "}
                        <a
                          href={selectedOsmPhoto.licenseUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {selectedOsmPhoto.license}
                        </a>
                        {" · "}
                        <a
                          href={selectedOsmPhoto.pageUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Wikimedia Commons
                        </a>
                        {" · "}
                        <a href={selectedOsmPhoto.osmUrl} rel="noopener noreferrer" target="_blank">
                          OpenStreetMap
                        </a>
                      </p>
                    ) : null}
                    <div className="imported-page__category">
                      <button
                        aria-expanded={categoryPickerOpen}
                        aria-label={`Category: ${PLACE_CATEGORY_LABELS[selectedCategory]}. Change category`}
                        className="imported-page__category-trigger"
                        onClick={() => setCategoryPickerOpen((open) => !open)}
                        type="button"
                      >
                        <span className={`timeline__icon timeline__icon--${selectedCategory}`}>
                          <PlaceCategoryIcon category={selectedCategory} />
                        </span>
                        <span className="imported-page__category-copy">
                          <span>Category</span>
                          <strong>{PLACE_CATEGORY_LABELS[selectedCategory]}</strong>
                        </span>
                        <ChevronDown aria-hidden="true" size={18} />
                      </button>
                      {categoryPickerOpen ? (
                        <div
                          aria-label="Choose place category"
                          className="imported-page__category-options"
                          role="group"
                        >
                          {PLACE_CATEGORIES.map((category) => (
                            <button
                              aria-pressed={
                                selectedCategory === category &&
                                selectedPlace.categoryOverride === category
                              }
                              disabled={categorySaving}
                              key={category}
                              onClick={() => void chooseCategory(category)}
                              type="button"
                            >
                              <span className={`timeline__icon timeline__icon--${category}`}>
                                <PlaceCategoryIcon category={category} />
                              </span>
                              <span>{PLACE_CATEGORY_LABELS[category]}</span>
                              {selectedCategory === category ? (
                                <Check aria-hidden="true" size={17} />
                              ) : null}
                            </button>
                          ))}
                          {selectedPlace.categoryOverride !== undefined ? (
                            <button
                              className="imported-page__category-reset"
                              disabled={categorySaving}
                              onClick={() => void chooseCategory(null)}
                              type="button"
                            >
                              Use imported map icon (
                              {
                                PLACE_CATEGORY_LABELS[
                                  categoryFromKmlStyle(
                                    selectedPlace.sourceKey,
                                    selectedPlace.styleRef,
                                  )
                                ]
                              }
                              )
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {!isImportLayerVisible(selectedPlace, hiddenLayers) ? (
                      <p className="imported-page__selected-hidden">
                        Hidden on map. You can still use this place in your plan. Open Map layers to
                        show it.
                      </p>
                    ) : null}
                    {selectedPlace.description !== "" ? (
                      <p className="imported-page__selected-description">
                        {selectedPlace.description}
                      </p>
                    ) : null}
                    {selectedSourceLinks.length > 0 ? (
                      <details>
                        <summary>{selectedSourceLinks.length} source media links</summary>
                        <ul>
                          {selectedSourceLinks.map((url, index) => (
                            <li key={`${url}-${index}`}>
                              <a href={url} rel="noopener noreferrer" target="_blank">
                                Open source media {index + 1}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <p className="imported-page__selected-coordinates">
                      <MapPin aria-hidden="true" size={21} strokeWidth={1.8} />
                      <span>
                        Coordinates from {selectedPlace.sourceName?.trim() || "an imported map"}
                      </span>
                    </p>
                    {!globalMaps ? (
                      <button onClick={() => void addToPlan(selectedPlace)} type="button">
                        <Plus aria-hidden="true" size={18} /> Add to{" "}
                        {KANTO_DAYS.find((day) => day.date === selectedDay)?.label}
                      </button>
                    ) : null}
                  </>
                )}
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
                  {searchResultsMode ? null : <span>{displayedPlaces.length}</span>}
                  {globalMaps ? (
                    <button onClick={() => setSearchOpen(false)} type="button">
                      Done
                    </button>
                  ) : null}
                </div>
                {displayedPlaces.length === 0 ? (
                  <p className="imported-page__list-empty">
                    {view === "plan"
                      ? "No places on this day yet. Choose a point from Places."
                      : "No places match this search."}
                  </p>
                ) : (
                  <div className="imported-page__list">
                    {listedPlaces.map((point, index) => (
                      <article className="imported-page__row" key={point.id}>
                        <button
                          onClick={() => {
                            setSelectedId(point.id);
                            setFocusSelectedId(point.id);
                            setSheetCollapsed(false);
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
                    {globalMaps && !searchResultsMode && displayedPlaces.length > visibleLimit ? (
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

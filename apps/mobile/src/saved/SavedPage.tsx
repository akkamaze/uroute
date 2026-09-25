import "../keyboard/keyboard-search.css";
import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronRight, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppMode } from "../app-mode";
import { displayImportedImageUrl, importedPlaceImages } from "../imports/import-media";
import { loadImportedPlaces } from "../imports/place-library";
import type { ImportedPoint } from "../imports/parse-place-file";
import { FRIDAY_STOPS, type PlannedStop } from "../plan/plan-data";
import { removeSavedPlace, useSavedPlaceIds } from "./saved-store";
import "./saved.css";

interface SavedPlaceRowProps {
  onRemove: (placeId: string) => void;
  place: PlannedStop;
}

function SavedPlaceRow({ onRemove, place }: SavedPlaceRowProps): React.JSX.Element {
  return (
    <article className="saved-place">
      <Link
        aria-label={`Open ${place.name}`}
        className="saved-place__main"
        search={{ place: place.id }}
        to="/places"
      >
        <img alt="" src={place.image} />

        <span className="saved-place__copy">
          <strong>{place.name}</strong>
          <span>
            {place.type} · {place.area}
          </span>
        </span>

        <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
      </Link>

      <button
        aria-label={`Remove ${place.name} from saved places`}
        className="saved-place__remove"
        onClick={() => onRemove(place.id)}
        type="button"
      >
        <Bookmark aria-hidden="true" fill="currentColor" size={21} strokeWidth={1.8} />
      </button>
    </article>
  );
}

function SavedImportedRow({
  onRemove,
  place,
}: {
  onRemove: (placeId: string) => void;
  place: ImportedPoint;
}): React.JSX.Element {
  const image = displayImportedImageUrl(importedPlaceImages(place)[0]);

  return (
    <article className="saved-place">
      <Link
        aria-label={`Open ${place.name}`}
        className="saved-place__main"
        search={{ place: place.id }}
        to="/maps"
      >
        {image === undefined ? (
          <span className="saved-place__image-placeholder">
            <MapPin aria-hidden="true" size={23} />
          </span>
        ) : (
          <img alt="" src={image} />
        )}
        <span className="saved-place__copy">
          <strong>{place.name}</strong>
          <span>{place.folder || "Imported map"}</span>
        </span>
        <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
      </Link>
      <button
        aria-label={`Remove ${place.name} from saved places`}
        className="saved-place__remove"
        onClick={() => onRemove(place.id)}
        type="button"
      >
        <Bookmark aria-hidden="true" fill="currentColor" size={21} strokeWidth={1.8} />
      </button>
    </article>
  );
}

export function SavedPage(): React.JSX.Element {
  const mode = useAppMode();
  const [query, setQuery] = useState("");
  const [importedPlaces, setImportedPlaces] = useState<ImportedPoint[]>([]);
  useEffect(() => {
    if (mode === "mock") {
      setImportedPlaces([]);

      return;
    }
    let active = true;
    void loadImportedPlaces()
      .then((places) => {
        if (active) {
          setImportedPlaces(places);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [mode]);
  const savedIds = useSavedPlaceIds();
  const savedPlaces = mode === "mock" ? FRIDAY_STOPS.filter((place) => savedIds.has(place.id)) : [];
  const savedImportedPlaces =
    mode === "real" ? importedPlaces.filter((place) => savedIds.has(place.id)) : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePlaces = savedPlaces.filter((place) =>
    `${place.name} ${place.type} ${place.area}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const visibleImportedPlaces = savedImportedPlaces.filter((place) =>
    `${place.name} ${place.folder}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const hasSavedPlaces = savedPlaces.length + savedImportedPlaces.length > 0;

  function removePlace(placeId: string): void {
    removeSavedPlace(placeId);
  }

  return (
    <section className="saved-page keyboard-search-page">
      <header className="saved-page__header">
        <h1>Saved</h1>
        <p>Places you want to remember.</p>
      </header>

      {hasSavedPlaces ? (
        <label className="saved-search">
          <Search aria-hidden="true" size={20} strokeWidth={1.8} />
          <input
            aria-label="Search saved places"
            data-keyboard-search
            enterKeyHint="search"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved places"
            type="search"
            value={query}
          />
        </label>
      ) : null}

      <div className="saved-results">
        {!hasSavedPlaces ? (
          <div className="saved-empty">
            <span className="saved-empty__icon">
              <Bookmark aria-hidden="true" size={28} strokeWidth={1.7} />
            </span>
            <h2>Save places for later</h2>
            <p>Keep ideas here while you plan your trip.</p>
            {mode === "mock" ? (
              <Link search={{ place: "kiyomizu" }} to="/places">
                Explore places
              </Link>
            ) : (
              <Link to="/maps">Explore places</Link>
            )}
          </div>
        ) : visiblePlaces.length + visibleImportedPlaces.length === 0 ? (
          <div className="saved-empty saved-empty--search">
            <h2>No saved places found</h2>
            <p>Try another name or area.</p>
          </div>
        ) : (
          <div aria-live="polite" className="saved-list">
            {visiblePlaces.map((place) => (
              <SavedPlaceRow key={place.id} onRemove={removePlace} place={place} />
            ))}
            {visibleImportedPlaces.map((place) => (
              <SavedImportedRow key={place.id} onRemove={removePlace} place={place} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

import { FRIDAY_STOPS, type PlannedStop } from "../plan/plan-data";
import "./saved.css";

const initialSavedPlaces = FRIDAY_STOPS.slice(0, 2);

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

export function SavedPage(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [savedPlaces, setSavedPlaces] = useState<readonly PlannedStop[]>(initialSavedPlaces);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePlaces = savedPlaces.filter((place) =>
    `${place.name} ${place.type} ${place.area}`.toLocaleLowerCase().includes(normalizedQuery),
  );

  function removePlace(placeId: string): void {
    setSavedPlaces((places) => places.filter((place) => place.id !== placeId));
  }

  return (
    <section className="saved-page">
      <header className="saved-page__header">
        <h1>Saved</h1>
        <p>Places you want to remember.</p>
      </header>

      {savedPlaces.length > 0 ? (
        <label className="saved-search">
          <Search aria-hidden="true" size={20} strokeWidth={1.8} />
          <input
            aria-label="Search saved places"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved places"
            type="search"
            value={query}
          />
        </label>
      ) : null}

      {savedPlaces.length === 0 ? (
        <div className="saved-empty">
          <span className="saved-empty__icon">
            <Bookmark aria-hidden="true" size={28} strokeWidth={1.7} />
          </span>
          <h2>Save places for later</h2>
          <p>Keep ideas here while you plan your trip.</p>
          <Link search={{ place: "kiyomizu" }} to="/places">
            Explore places
          </Link>
        </div>
      ) : visiblePlaces.length === 0 ? (
        <div className="saved-empty saved-empty--search">
          <h2>No saved places found</h2>
          <p>Try another name or area.</p>
        </div>
      ) : (
        <div aria-live="polite" className="saved-list">
          {visiblePlaces.map((place) => (
            <SavedPlaceRow key={place.id} onRemove={removePlace} place={place} />
          ))}
        </div>
      )}
    </section>
  );
}

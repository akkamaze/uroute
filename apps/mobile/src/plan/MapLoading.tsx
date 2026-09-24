import { AnimatedBrandMark } from "../brand";

export function MapLoading(): React.JSX.Element {
  return (
    <div aria-label="Loading map" className="trip-map__status" role="status">
      <span className="trip-map__loading-mark">
        <AnimatedBrandMark />
      </span>
      <span>Loading map…</span>
    </div>
  );
}

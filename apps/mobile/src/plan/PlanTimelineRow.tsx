import { Footprints, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { PlaceCategoryIcon } from "../places/PlaceCategoryIcon";
import type { PlaceCategory } from "../places/place-category";
import { VisitTime } from "./VisitTime";

interface SwipeControls {
  open: boolean;
  offset: number;
  onStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCancel: () => void;
}

interface PlanTimelineRowProps {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  category: PlaceCategory;
  image?: string | undefined;
  selected?: boolean | undefined;
  onOpen: () => void;
  buttonRef?: ((element: HTMLButtonElement | null) => void) | undefined;
  onRemove?: (() => void) | undefined;
  removeLabel?: string | undefined;
  swipe?: SwipeControls | undefined;
  travel?: string | undefined;
  children?: ReactNode;
}

export function PlanTimelineRow({
  id,
  title,
  subtitle,
  time,
  category,
  image,
  selected,
  onOpen,
  buttonRef,
  onRemove,
  removeLabel,
  swipe,
  travel,
  children,
}: PlanTimelineRowProps): React.JSX.Element {
  return (
    <div className="timeline__entry" data-plan-stop-id={id}>
      <div className="timeline__swipe-shell" data-swipe-back-ignore="true">
        {onRemove && swipe ? (
          <button
            aria-hidden={!swipe.open}
            aria-label={removeLabel ?? `Remove ${title}`}
            className="timeline__remove"
            onClick={onRemove}
            tabIndex={swipe.open ? 0 : -1}
            type="button"
          >
            <Trash2 aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>Remove</span>
          </button>
        ) : null}
        <div
          className={`timeline__surface timeline__surface--plan${swipe?.open ? " timeline__surface--swipe-open" : ""}`}
          onLostPointerCapture={swipe?.onCancel}
          onPointerCancel={swipe?.onCancel}
          onPointerDown={swipe?.onStart}
          onPointerMove={swipe?.onMove}
          onPointerUp={swipe?.onEnd}
          style={
            swipe
              ? ({ "--swipe-offset": `${swipe.open ? swipe.offset : 0}px` } as React.CSSProperties)
              : undefined
          }
        >
          <button
            aria-pressed={selected}
            className={`timeline__stop${image ? "" : " timeline__stop--no-photo"}`}
            data-stop-id={id}
            onClick={onOpen}
            ref={buttonRef}
            type="button"
          >
            {time === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? (
              <VisitTime className="timeline__time" time={time} />
            ) : (
              <span className="timeline__time">{time}</span>
            )}
            <span className={`timeline__icon timeline__icon--${category}`}>
              <PlaceCategoryIcon category={category} />
            </span>
            <span className="timeline__info">
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </span>
            {image ? <img alt="" className="timeline__photo" src={image} /> : null}
          </button>
        </div>
      </div>
      {children}
      {travel ? (
        <div className="timeline__travel">
          <span aria-hidden="true" className="timeline__line" />
          <span aria-hidden="true" className="timeline__travel-marker">
            <Footprints size={19} strokeWidth={1.8} />
          </span>
          <span>{travel}</span>
        </div>
      ) : null}
    </div>
  );
}

import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { displayImportedImageUrl } from "./import-media";

interface ImportedPlaceGalleryProps {
  images: readonly string[];
  name: string;
}

export function ImportedPlaceGallery({
  images,
  name,
}: ImportedPlaceGalleryProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (activeIndex === null) {
      if (dialog.open) {
        dialog.close();
      }
    } else if (!dialog.open) {
      dialog.showModal();
    }
  }, [activeIndex]);

  if (images.length === 0) {
    return null;
  }

  const activeUrl = activeIndex === null ? null : (images[activeIndex] ?? null);

  function changeImage(direction: -1 | 1): void {
    setActiveIndex((index) =>
      index === null ? null : (index + direction + images.length) % images.length,
    );
  }

  return (
    <section aria-label={`${name} photos`} className="imported-gallery">
      <div className="imported-gallery__track">
        {images.slice(0, 4).map((url, index) => (
          <button
            aria-label={`View photo ${index + 1} of ${images.length}`}
            className="imported-gallery__thumb"
            key={url}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            {failed.has(url) ? (
              <Images aria-hidden="true" size={24} />
            ) : (
              <img
                alt=""
                loading="lazy"
                onError={() => setFailed((current) => new Set(current).add(url))}
                src={displayImportedImageUrl(url)}
              />
            )}
          </button>
        ))}
        {images.length > 4 ? (
          <button
            className="imported-gallery__more"
            onClick={() => setActiveIndex(4)}
            type="button"
          >
            <Images aria-hidden="true" size={22} />
            <span>See all {images.length} photos</span>
          </button>
        ) : null}
      </div>

      <dialog
        aria-label={`${name} photos`}
        className="imported-gallery__dialog"
        data-sheet-drag-ignore="true"
        onClose={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            changeImage(-1);
          } else if (event.key === "ArrowRight") {
            changeImage(1);
          }
        }}
        ref={dialogRef}
      >
        <header>
          <span>{activeIndex === null ? "" : `${activeIndex + 1} / ${images.length}`}</span>
          <button aria-label="Close photos" onClick={() => setActiveIndex(null)} type="button">
            <X aria-hidden="true" size={23} />
          </button>
        </header>
        <div
          className="imported-gallery__full"
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartRef.current = null;
            if (start !== null && end !== undefined && Math.abs(end - start) > 45) {
              changeImage(end < start ? 1 : -1);
            }
          }}
          onTouchStart={(event) => {
            touchStartRef.current = event.touches[0]?.clientX ?? null;
          }}
        >
          {activeUrl !== null && !failed.has(activeUrl) ? (
            <>
              <img
                alt=""
                aria-hidden="true"
                className="imported-gallery__backdrop"
                src={displayImportedImageUrl(activeUrl)}
              />
              <img
                alt={`${name}, photo ${(activeIndex ?? 0) + 1}`}
                className="imported-gallery__photo"
                onError={() => setFailed((current) => new Set(current).add(activeUrl))}
                src={displayImportedImageUrl(activeUrl)}
              />
            </>
          ) : (
            <p>Image unavailable.</p>
          )}
          {images.length > 1 ? (
            <>
              <button
                aria-label="Previous photo"
                className="imported-gallery__previous"
                onClick={() => changeImage(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={26} />
              </button>
              <button
                aria-label="Next photo"
                className="imported-gallery__next"
                onClick={() => changeImage(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={26} />
              </button>
            </>
          ) : null}
        </div>
      </dialog>
    </section>
  );
}

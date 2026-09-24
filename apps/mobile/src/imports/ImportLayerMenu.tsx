import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import {
  folderLayerKey,
  kindLayerKey,
  sourceLayerKey,
  type ImportLayerKind,
  type ImportLayerSource,
} from "./import-layer-visibility";

interface ImportLayerMenuProps {
  hidden: ReadonlySet<string>;
  onClose: () => void;
  onHideAll: () => void;
  onShowAll: () => void;
  onShowAllSource: (source: ImportLayerSource) => void;
  onToggle: (key: string) => void;
  open: boolean;
  sources: readonly ImportLayerSource[];
}

const KIND_LABELS: { kind: ImportLayerKind; label: string }[] = [
  { kind: "point", label: "Places" },
  { kind: "line", label: "Lines" },
  { kind: "area", label: "Areas" },
];

function sourceTotal(source: ImportLayerSource): number {
  return source.counts.point + source.counts.line + source.counts.area;
}

function sourceShown(source: ImportLayerSource): number {
  return source.shownCounts.point + source.shownCounts.line + source.shownCounts.area;
}

export function ImportLayerMenu({
  hidden,
  onClose,
  onHideAll,
  onShowAll,
  onShowAllSource,
  onToggle,
  open,
  sources,
}: ImportLayerMenuProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function closeSheet(): void {
    if (beginDialogDismissal(dialogRef.current)) {
      onClose();
    }
  }

  return (
    <dialog
      aria-labelledby="import-map-layers-title"
      className="imported-page__layers-dialog"
      id="import-map-layers"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSheet();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeSheet();
        }
      }}
      ref={dialogRef}
    >
      <div className="imported-page__layers-surface">
        <header className="imported-page__layers-heading">
          <div>
            <h2 id="import-map-layers-title">Map layers</h2>
            <p>Choose what appears on this map.</p>
          </div>
          <button
            aria-label="Close map layers"
            className="imported-page__layers-close"
            onClick={closeSheet}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="imported-page__layers-actions">
          <span>Visibility for this trip</span>
          <button onClick={onShowAll} type="button">
            Show all
          </button>
          <button onClick={onHideAll} type="button">
            Hide all
          </button>
        </div>
        <div className="imported-page__layers-list">
          <p className="imported-page__layers-explainer">
            A file, type and folder must all be on. Counts here ignore search and day filters;
            turning a file back on keeps your choices.
          </p>
          {sources.map((source) => {
            const sourceHidden = hidden.has(sourceLayerKey(source.id));
            const shown = sourceShown(source);
            const total = sourceTotal(source);
            const status = sourceHidden
              ? "File off"
              : shown === total
                ? "All enabled"
                : shown === 0
                  ? "No items enabled"
                  : "Partly enabled";

            return (
              <section
                aria-label={source.label}
                className="imported-page__layer-source"
                key={source.id}
              >
                <label className="imported-page__layer-row imported-page__layer-row--source">
                  <span>
                    <strong>{source.label}</strong>
                    <small>
                      {source.counts.point} places · {source.counts.line} lines ·{" "}
                      {source.counts.area} areas
                    </small>
                  </span>
                  <input
                    aria-label={`Show ${source.label}`}
                    checked={!sourceHidden}
                    onChange={() => onToggle(sourceLayerKey(source.id))}
                    role="switch"
                    type="checkbox"
                  />
                </label>
                <p className="imported-page__layer-status">
                  {status} · {shown} of {total} enabled
                </p>
                {shown === total ? null : (
                  <button
                    className="imported-page__layer-reset"
                    onClick={() => onShowAllSource(source)}
                    type="button"
                  >
                    Show all in this file
                  </button>
                )}
                <div
                  aria-label={`Types in ${source.label}`}
                  className="imported-page__layer-types"
                  role="group"
                >
                  {KIND_LABELS.filter(({ kind }) => source.counts[kind] > 0).map(
                    ({ kind, label }) => (
                      <label className="imported-page__layer-row" key={kind}>
                        <span>
                          {label}
                          <small>
                            {source.shownCounts[kind]} / {source.counts[kind]} enabled
                            {sourceHidden ? " · File is off" : ""}
                          </small>
                        </span>
                        <input
                          aria-label={`Show ${label.toLowerCase()} in ${source.label}`}
                          checked={!hidden.has(kindLayerKey(source.id, kind))}
                          disabled={sourceHidden}
                          onChange={() => onToggle(kindLayerKey(source.id, kind))}
                          role="switch"
                          type="checkbox"
                        />
                      </label>
                    ),
                  )}
                </div>
                {source.counts.line === 0 && source.counts.area === 0 ? (
                  <p className="imported-page__layer-hint">
                    Missing lines or areas from an older import? Import this file again to add them.
                  </p>
                ) : null}
                <details className="imported-page__layer-folders">
                  <summary>Folders from this file ({source.folders.length})</summary>
                  {source.folders.map((folder) => {
                    const folderHidden = hidden.has(folderLayerKey(source.id, folder.name));
                    const kindsOff = (Object.keys(folder.counts) as ImportLayerKind[]).some(
                      (kind) =>
                        folder.counts[kind] > 0 && hidden.has(kindLayerKey(source.id, kind)),
                    );

                    return (
                      <label className="imported-page__layer-row" key={folder.name}>
                        <span>
                          {folder.name}
                          <small>
                            {folder.shownCount} / {folder.count} enabled
                            {sourceHidden
                              ? " · File is off"
                              : !folderHidden && kindsOff
                                ? " · Some types are off"
                                : ""}
                          </small>
                        </span>
                        <input
                          aria-label={`Show ${folder.name} in ${source.label}`}
                          checked={!folderHidden}
                          disabled={sourceHidden}
                          onChange={() => onToggle(folderLayerKey(source.id, folder.name))}
                          role="switch"
                          type="checkbox"
                        />
                      </label>
                    );
                  })}
                </details>
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

import { X } from "lucide-react";

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
  onToggle: (key: string) => void;
  sources: readonly ImportLayerSource[];
}

const KIND_LABELS: { kind: ImportLayerKind; label: string }[] = [
  { kind: "point", label: "Points" },
  { kind: "line", label: "Lines" },
  { kind: "area", label: "Areas" },
];

export function ImportLayerMenu({
  hidden,
  onClose,
  onToggle,
  sources,
}: ImportLayerMenuProps): React.JSX.Element {
  return (
    <section aria-label="Map layers" className="imported-page__layers" id="import-map-layers">
      <div className="imported-page__layers-heading">
        <div>
          <h2>Map layers</h2>
          <p>Show or hide imported items on this map.</p>
        </div>
        <button aria-label="Close map layers" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </div>
      {sources.map((source) => {
        const sourceHidden = hidden.has(sourceLayerKey(source.id));

        return (
          <div className="imported-page__layer-source" key={source.id}>
            <label className="imported-page__layer-row imported-page__layer-row--source">
              <input
                aria-label={`Show ${source.label}`}
                checked={!sourceHidden}
                onChange={() => onToggle(sourceLayerKey(source.id))}
                type="checkbox"
              />
              <span>
                <strong>{source.label}</strong>
                <small>
                  {source.counts.point} points · {source.counts.line} lines · {source.counts.area}{" "}
                  areas
                </small>
              </span>
            </label>
            <div className="imported-page__layer-types">
              {KIND_LABELS.filter(({ kind }) => source.counts[kind] > 0).map(({ kind, label }) => (
                <label className="imported-page__layer-row" key={kind}>
                  <input
                    aria-label={`Show ${label.toLowerCase()} in ${source.label}`}
                    checked={!hidden.has(kindLayerKey(source.id, kind))}
                    disabled={sourceHidden}
                    onChange={() => onToggle(kindLayerKey(source.id, kind))}
                    type="checkbox"
                  />
                  <span>{label}</span>
                  <small>{source.counts[kind]}</small>
                </label>
              ))}
            </div>
            {source.counts.line === 0 && source.counts.area === 0 ? (
              <p className="imported-page__layer-hint">
                If this file has lines or areas, import it again to add them.
              </p>
            ) : null}
            <details className="imported-page__layer-folders">
              <summary>Folders ({source.folders.length})</summary>
              {source.folders.map((folder) => (
                <label className="imported-page__layer-row" key={folder.name}>
                  <input
                    aria-label={`Show ${folder.name} in ${source.label}`}
                    checked={!hidden.has(folderLayerKey(source.id, folder.name))}
                    disabled={sourceHidden}
                    onChange={() => onToggle(folderLayerKey(source.id, folder.name))}
                    type="checkbox"
                  />
                  <span>{folder.name}</span>
                  <small>{folder.count}</small>
                </label>
              ))}
            </details>
          </div>
        );
      })}
    </section>
  );
}

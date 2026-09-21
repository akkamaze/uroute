import { ArrowLeft, Check, Pencil } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { getKyotoPlan, updateKyotoVisit, useKyotoPlan, type KyotoDay } from "../plan/plan-store";

interface VisitNotesProps {
  placeId: string;
  preferredDay: KyotoDay | undefined;
  editorOpen: boolean;
  onEdit: () => void;
  onEditorClose: () => void;
  onPlanVisit: () => void;
}

function dayLabel(day: KyotoDay): string {
  const label = new Date(Date.UTC(2026, 10, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return label.replace(/^([^ ]+) /, "$1, ");
}

export function VisitNotes({
  placeId,
  preferredDay,
  editorOpen,
  onEdit,
  onEditorClose,
  onPlanVisit,
}: VisitNotesProps): React.JSX.Element {
  const plan = useKyotoPlan();
  const fallbackDay = preferredDay ?? 13;
  const visit = plan.days[fallbackDay].find((entry) => entry.placeId === placeId);
  const current = visit === undefined ? undefined : { day: fallbackDay, visit };
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const descriptionId = useId();
  const label = dayLabel(fallbackDay);

  useLayoutEffect(() => {
    if (editorOpen) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [editorOpen]);

  useEffect(() => {
    if (notice === "") {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(""), 1800);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function startEditing(): void {
    if (current === undefined) {
      return;
    }
    setDraft(current.visit.notes);
    setNotice("");
    setError("");
    onEdit();
  }

  function finishEditing(): void {
    setError("");
    onEditorClose();
  }

  function save(): void {
    if (current === undefined) {
      return;
    }
    const latestVisit = getKyotoPlan().days[current.day].find((entry) => entry.placeId === placeId);
    if (
      latestVisit === undefined ||
      !updateKyotoVisit(current.day, { ...latestVisit, notes: draft })
    ) {
      setError("This note could not be saved. Try again.");

      return;
    }
    setNotice(getKyotoPlan().persistenceFailed ? "Saved for this session" : "Saved");
    finishEditing();
  }

  return (
    <section aria-label="Visit description" className="visit-notes">
      {editorOpen && current !== undefined ? (
        <form
          className="visit-note-panel"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="visit-note-panel__heading">
            <button aria-label="Back to place details" onClick={finishEditing} type="button">
              <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
            <div>
              <p>Visit note</p>
              <h2>Edit note</h2>
            </div>
          </div>
          <textarea
            aria-label={`Note for ${label}`}
            enterKeyHint="enter"
            inputMode="text"
            maxLength={5000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                finishEditing();
              }
            }}
            placeholder="What would you like to remember?"
            ref={textareaRef}
            rows={5}
            value={draft}
          />
          {error === "" ? null : (
            <p className="visit-note-panel__error" role="alert">
              {error}
            </p>
          )}
          <button
            className="visit-note-panel__save"
            disabled={draft === current.visit.notes}
            type="submit"
          >
            Save note
          </button>
        </form>
      ) : current === undefined ? (
        <button
          className="visit-notes__card visit-notes__card--empty"
          onClick={onPlanVisit}
          type="button"
        >
          <span>Plan a visit to add a note</span>
          <Pencil aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      ) : current.visit.notes === "" ? (
        <button
          aria-label={`Add note for ${label}`}
          className="visit-notes__card visit-notes__card--empty"
          onClick={startEditing}
          type="button"
        >
          <span>Add a note</span>
          <Pencil aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      ) : (
        <button
          aria-describedby={descriptionId}
          aria-label={`Edit note for ${label}`}
          className="visit-notes__card"
          onClick={startEditing}
          type="button"
        >
          <span className="visit-notes__content" id={descriptionId}>
            {current.visit.notes}
          </span>
          <Pencil aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      )}
      {notice === "" ? null : (
        <aside aria-live="polite" className="visit-note-toast" role="status">
          <Check aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>{notice}</span>
        </aside>
      )}
    </section>
  );
}

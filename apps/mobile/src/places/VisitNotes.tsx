import { useLayoutEffect, useRef, useState } from "react";

import {
  getKyotoPlan,
  KYOTO_DAYS,
  updateKyotoVisit,
  useKyotoPlan,
  type KyotoDay,
} from "../plan/plan-store";

interface VisitNotesProps {
  placeId: string;
  preferredDay: KyotoDay | undefined;
  onEdit: () => void;
  onPlanVisit: () => void;
}

function dayLabel(day: KyotoDay): string {
  return new Date(Date.UTC(2026, 10, day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function VisitNotes({
  placeId,
  preferredDay,
  onEdit,
  onPlanVisit,
}: VisitNotesProps): React.JSX.Element {
  const plan = useKyotoPlan();
  const visits = KYOTO_DAYS.flatMap((day) => {
    const visit = plan.days[day].find((entry) => entry.placeId === placeId);

    return visit === undefined ? [] : [{ day, visit }];
  });
  const [chosenDay, setChosenDay] = useState(preferredDay);
  const current = visits.find((entry) => entry.day === chosenDay) ?? visits[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (editing) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  function startEditing(): void {
    if (current === undefined) {
      return;
    }
    setDraft(current.visit.notes);
    setNotice("");
    setError("");
    onEdit();
    setEditing(true);
  }

  function finishEditing(): void {
    setEditing(false);
    setError("");
    window.requestAnimationFrame(() => editButtonRef.current?.focus({ preventScroll: true }));
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
    setNotice(
      getKyotoPlan().persistenceFailed
        ? "Note kept for this session. Device storage is unavailable."
        : "Note saved.",
    );
    finishEditing();
  }

  return (
    <section aria-label="Visit notes" className="visit-notes">
      <header className="visit-notes__header">
        <h2>Notes</h2>
        {!editing && current !== undefined && current.visit.notes !== "" ? (
          <button aria-label="Edit notes" onClick={startEditing} ref={editButtonRef} type="button">
            Edit
          </button>
        ) : null}
      </header>
      {visits.length > 1 ? (
        <div aria-label="Note day" className="visit-notes__days" role="group">
          {visits.map(({ day }) => (
            <button
              aria-pressed={current?.day === day}
              disabled={editing}
              key={day}
              onClick={() => {
                setChosenDay(day);
                setNotice("");
              }}
              type="button"
            >
              {dayLabel(day)}
            </button>
          ))}
        </div>
      ) : current === undefined ? null : (
        <p className="visit-notes__day">{dayLabel(current.day)}</p>
      )}
      {current === undefined ? (
        <div className="visit-notes__empty">
          <p>Plan a visit to keep a note for this place.</p>
          <button onClick={onPlanVisit} type="button">
            Plan a visit
          </button>
        </div>
      ) : editing ? (
        <div className="visit-notes__editor">
          <textarea
            aria-label="Notes"
            enterKeyHint="enter"
            inputMode="text"
            maxLength={5000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                finishEditing();
              }
            }}
            placeholder="What would you like to remember?"
            ref={textareaRef}
            rows={3}
            value={draft}
          />
          <div className="visit-notes__actions">
            <button onClick={finishEditing} type="button">
              Cancel
            </button>
            <button disabled={draft === current.visit.notes} onClick={save} type="button">
              Save note
            </button>
          </div>
          {error === "" ? null : <p role="alert">{error}</p>}
        </div>
      ) : current.visit.notes === "" ? (
        <button
          aria-label="Add note"
          className="visit-notes__add"
          onClick={startEditing}
          ref={editButtonRef}
          type="button"
        >
          Add a note for this visit…
        </button>
      ) : (
        <p className="visit-notes__content">{current.visit.notes}</p>
      )}
      {notice === "" ? null : (
        <p className="visit-notes__status" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

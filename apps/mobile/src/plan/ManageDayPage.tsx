import { useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Coffee,
  GripVertical,
  History,
  Landmark,
  Redo2,
  Trash2,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { FRIDAY_STOPS } from "./plan-data";
import {
  addManageDayVersion,
  clearManageDayDraft,
  loadManageDayDraft,
  loadManageDayVersions,
  saveManageDayDraft,
  visitsSignature,
  type ManageDayVersion,
} from "./manage-day-store";
import { saveKyotoDay, useKyotoPlan, type PlannedVisit } from "./plan-store";
import "./manage-day.css";

const DAY_NAMES = new Map([
  [12, "Thursday"],
  [13, "Friday"],
  [14, "Saturday"],
  [15, "Sunday"],
  [16, "Monday"],
]);

interface DragState {
  active: boolean;
  current: PlannedVisit[];
  latestY: number;
  layoutOffsetY: number;
  onEnd: (event: PointerEvent) => void;
  onMove: (event: PointerEvent) => void;
  original: PlannedVisit[];
  overCancel: boolean;
  pointerId: number;
  sourceId: string;
  startScrollTop: number;
  startX: number;
  startY: number;
  surface: HTMLElement | null;
}

interface PreviewAnimation {
  before: Map<string, DOMRect>;
  draggedTop: number | null;
  sourceId: string;
}

function cloneVisits(visits: readonly PlannedVisit[]): PlannedVisit[] {
  return visits.map((visit) => ({ ...visit }));
}

function moveVisit(
  visits: readonly PlannedVisit[],
  sourceId: string,
  targetId: string,
): PlannedVisit[] {
  const sourceIndex = visits.findIndex((visit) => visit.placeId === sourceId);
  const targetIndex = visits.findIndex((visit) => visit.placeId === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return cloneVisits(visits);
  }
  const next = cloneVisits(visits);
  const [moved] = next.splice(sourceIndex, 1);
  if (moved !== undefined) {
    next.splice(targetIndex, 0, moved);
  }

  return next;
}

function describeChange(before: readonly PlannedVisit[], after: readonly PlannedVisit[]): string {
  const afterIds = new Set(after.map((visit) => visit.placeId));
  const removed = before.filter((visit) => !afterIds.has(visit.placeId)).length;
  const sharedBefore = before
    .filter((visit) => afterIds.has(visit.placeId))
    .map((visit) => visit.placeId);
  const reordered = sharedBefore.some((id, index) => after[index]?.placeId !== id);

  if (removed > 0 && reordered) {
    return `Reordered places · Removed ${removed}`;
  }
  if (removed > 0) {
    return `Removed ${removed} ${removed === 1 ? "place" : "places"}`;
  }
  if (reordered) {
    return "Reordered places";
  }

  return "Updated day";
}

function formatVersionTime(savedAt: number): string {
  const saved = new Date(savedAt);
  const today = new Date();
  const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(saved);
  if (saved.toDateString() === today.toDateString()) {
    return `Today, ${time}`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (saved.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(saved);
}

function renderStopIcon(category: string): React.JSX.Element {
  if (category === "coffee") {
    return <Coffee aria-hidden="true" size={19} strokeWidth={1.8} />;
  }
  if (category === "food") {
    return <Utensils aria-hidden="true" size={19} strokeWidth={1.8} />;
  }

  return <Landmark aria-hidden="true" size={19} strokeWidth={1.8} />;
}

export function ManageDayPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/plan/manage" });
  const day = search.day ?? 13;
  const plan = useKyotoPlan();
  const initialVisitsRef = useRef(cloneVisits(plan.days[day]));
  const baseSignatureRef = useRef(visitsSignature(initialVisitsRef.current));
  const storedDraftRef = useRef(loadManageDayDraft(day, baseSignatureRef.current));
  const [draft, setDraft] = useState<PlannedVisit[]>(() =>
    cloneVisits(storedDraftRef.current?.visits ?? initialVisitsRef.current),
  );
  const [undoStack, setUndoStack] = useState<PlannedVisit[][]>([]);
  const [redoStack, setRedoStack] = useState<PlannedVisit[][]>([]);
  const [versions, setVersions] = useState<ManageDayVersion[]>(() => loadManageDayVersions(day));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<PlannedVisit[] | null>(null);
  const [cancelMoveActive, setCancelMoveActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [leaveRequested, setLeaveRequested] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const allowExitRef = useRef(false);
  const leaveDialogRef = useRef<HTMLDialogElement>(null);
  const saveDialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewAnimationRef = useRef<PreviewAnimation | null>(null);
  const displayedVisits = dragPreview ?? draft;
  const baseSignature = baseSignatureRef.current;
  const dirty = visitsSignature(draft) !== baseSignature;
  const externalChange = visitsSignature(plan.days[day]) !== baseSignature;
  const removedCount = initialVisitsRef.current.filter(
    (visit) => !draft.some((candidate) => candidate.placeId === visit.placeId),
  ).length;
  const dayName = DAY_NAMES.get(day) ?? "Selected day";
  const dayLabel = `${dayName}, ${day} November`;
  const selectionCount = selectedIds.size;

  const stops = useMemo(() => new Map(FRIDAY_STOPS.map((stop) => [stop.id, stop])), []);

  const navigationBlocker = useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) =>
      !allowExitRef.current &&
      dirty &&
      current.pathname === "/plan/manage" &&
      next.pathname !== "/plan/manage",
    withResolver: true,
  });

  function commitDraft(next: readonly PlannedVisit[], message: string): void {
    if (visitsSignature(next) === visitsSignature(draft)) {
      return;
    }
    setUndoStack((current) => [...current, cloneVisits(draft)]);
    setRedoStack([]);
    setDraft(cloneVisits(next));
    setNotice(message);
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    if (previous === undefined) {
      return;
    }
    setRedoStack((current) => [cloneVisits(draft), ...current]);
    setUndoStack((current) => current.slice(0, -1));
    setDraft(cloneVisits(previous));
    setNotice("Last change undone");
  }

  function redo(): void {
    const next = redoStack[0];
    if (next === undefined) {
      return;
    }
    setUndoStack((current) => [...current, cloneVisits(draft)]);
    setRedoStack((current) => current.slice(1));
    setDraft(cloneVisits(next));
    setNotice("Change restored");
  }

  function exitToPlan(): void {
    allowExitRef.current = true;
    void navigate({ to: "/plan", search: { day }, replace: true });
  }

  function discardAndExit(): void {
    clearManageDayDraft(day);
    setLeaveRequested(false);
    if (navigationBlocker.status === "blocked") {
      allowExitRef.current = true;
      navigationBlocker.proceed();
    } else {
      exitToPlan();
    }
  }

  function keepDraftAndExit(): void {
    saveManageDayDraft(day, baseSignature, draft);
    setLeaveRequested(false);
    if (navigationBlocker.status === "blocked") {
      allowExitRef.current = true;
      navigationBlocker.proceed();
    } else {
      exitToPlan();
    }
  }

  function finishSave(): void {
    setConfirmSave(false);
    setSaving(true);
    if (!saveKyotoDay(day, draft)) {
      setSaving(false);
      setNotice("Could not save. Your draft is still here.");

      return;
    }
    let nextVersions = versions;
    if (nextVersions.length === 0) {
      nextVersions = addManageDayVersion(day, initialVisitsRef.current, "Initial plan");
    }
    nextVersions = addManageDayVersion(day, draft, describeChange(initialVisitsRef.current, draft));
    setVersions(nextVersions);
    clearManageDayDraft(day);
    setSaving(false);
    exitToPlan();
  }

  function requestSave(): void {
    if (!dirty || externalChange || saving) {
      return;
    }
    if (removedCount > 1) {
      setConfirmSave(true);
    } else {
      finishSave();
    }
  }

  function removeSelected(): void {
    if (selectedIds.size === 0) {
      return;
    }
    const count = selectedIds.size;
    commitDraft(
      draft.filter((visit) => !selectedIds.has(visit.placeId)),
      `${count} ${count === 1 ? "place" : "places"} removed from draft`,
    );
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function moveWithKeyboard(id: string, direction: -1 | 1): void {
    const index = draft.findIndex((visit) => visit.placeId === id);
    const target = draft[index + direction];
    const stop = stops.get(id);
    if (index < 0 || target === undefined) {
      return;
    }
    commitDraft(moveVisit(draft, id, target.placeId), `${stop?.name ?? "Place"} moved`);
  }

  function captureRowRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-manage-row-id]").forEach((row) => {
      const id = row.dataset.manageRowId;
      if (id !== undefined) {
        rects.set(id, row.getBoundingClientRect());
      }
    });

    return rects;
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, id: string): void {
    if (selectionMode || event.button !== 0) {
      return;
    }
    const drag: DragState = {
      active: false,
      current: cloneVisits(draft),
      latestY: event.clientY,
      layoutOffsetY: 0,
      onEnd: () => undefined,
      onMove: () => undefined,
      original: cloneVisits(draft),
      overCancel: false,
      pointerId: event.pointerId,
      sourceId: id,
      startScrollTop: listRef.current?.scrollTop ?? 0,
      startX: event.clientX,
      startY: event.clientY,
      surface: event.currentTarget.closest<HTMLElement>("[data-manage-row-id]"),
    };
    drag.onMove = (pointerEvent) => {
      if (pointerEvent.pointerId !== drag.pointerId) {
        return;
      }
      if (
        !drag.active &&
        Math.hypot(pointerEvent.clientX - drag.startX, pointerEvent.clientY - drag.startY) < 8
      ) {
        return;
      }
      drag.active = true;
      drag.latestY = pointerEvent.clientY;
      pointerEvent.preventDefault();
      setDraggedId(id);
      const scrollDelta = (listRef.current?.scrollTop ?? 0) - drag.startScrollTop;
      drag.surface?.style.setProperty(
        "--manage-drag-offset-y",
        `${pointerEvent.clientY - drag.startY + scrollDelta + drag.layoutOffsetY}px`,
      );
      const cancelTarget = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest(".manage-day__cancel-move");
      drag.overCancel = cancelTarget !== null;
      setCancelMoveActive(drag.overCancel);
      if (drag.overCancel) {
        setDragPreview(cloneVisits(drag.original));

        return;
      }
      const otherRows = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-manage-row-id]") ?? [],
      ).filter((row) => row.dataset.manageRowId !== id);
      const insertionIndex = otherRows.findIndex(
        (row) => pointerEvent.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2,
      );
      const source = drag.current.find((visit) => visit.placeId === id);
      const withoutSource = drag.current.filter((visit) => visit.placeId !== id);
      const next = cloneVisits(withoutSource);
      if (source !== undefined) {
        next.splice(insertionIndex < 0 ? next.length : insertionIndex, 0, { ...source });
      }
      if (visitsSignature(next) !== visitsSignature(drag.current)) {
        const before = captureRowRects();
        previewAnimationRef.current = {
          before,
          draggedTop: before.get(id)?.top ?? null,
          sourceId: id,
        };
        drag.current = next;
        setDragPreview(cloneVisits(drag.current));
      }
      const list = listRef.current;
      if (list !== null) {
        const bounds = list.getBoundingClientRect();
        if (pointerEvent.clientY < bounds.top + 48) {
          list.scrollTop -= 10;
        } else if (pointerEvent.clientY > bounds.bottom - 48) {
          list.scrollTop += 10;
        }
      }
    };
    drag.onEnd = (pointerEvent) => {
      if (pointerEvent.pointerId !== drag.pointerId) {
        return;
      }
      window.removeEventListener("pointermove", drag.onMove);
      window.removeEventListener("pointerup", drag.onEnd);
      window.removeEventListener("pointercancel", drag.onEnd);
      dragRef.current = null;
      setDraggedId(null);
      setDragPreview(null);
      setCancelMoveActive(false);
      window.requestAnimationFrame(() => {
        drag.surface?.style.removeProperty("--manage-drag-offset-y");
      });
      if (!drag.active || drag.overCancel || pointerEvent.type === "pointercancel") {
        if (drag.active) {
          setNotice("Move cancelled");
        }

        return;
      }
      const stop = stops.get(id);
      commitDraft(drag.current, `${stop?.name ?? "Place"} moved`);
    };
    dragRef.current = drag;
    window.addEventListener("pointermove", drag.onMove, { passive: false });
    window.addEventListener("pointerup", drag.onEnd);
    window.addEventListener("pointercancel", drag.onEnd);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (dirty) {
        setDraftStorageFailed(!saveManageDayDraft(day, baseSignature, draft));
      } else {
        clearManageDayDraft(day);
        setDraftStorageFailed(false);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [baseSignature, day, dirty, draft]);

  useEffect(() => {
    const dialog = leaveDialogRef.current;
    const shouldOpen = leaveRequested || navigationBlocker.status === "blocked";
    if (dialog !== null && shouldOpen && !dialog.open) {
      dialog.showModal();
    } else if (dialog !== null && !shouldOpen && dialog.open) {
      dialog.close();
    }
  }, [leaveRequested, navigationBlocker.status]);

  useEffect(() => {
    const dialog = saveDialogRef.current;
    if (dialog !== null && confirmSave && !dialog.open) {
      dialog.showModal();
    } else if (dialog !== null && !confirmSave && dialog.open) {
      dialog.close();
    }
  }, [confirmSave]);

  useLayoutEffect(() => {
    const pending = previewAnimationRef.current;
    if (pending === null) {
      return;
    }
    previewAnimationRef.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-manage-row-id]");
    if (rows === undefined) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rows.forEach((row) => {
      const id = row.dataset.manageRowId;
      if (id === undefined) {
        return;
      }
      const after = row.getBoundingClientRect();
      const before = pending.before.get(id);
      if (id === pending.sourceId) {
        const drag = dragRef.current;
        if (drag !== null && pending.draggedTop !== null) {
          drag.layoutOffsetY += pending.draggedTop - after.top;
          const scrollDelta = (listRef.current?.scrollTop ?? 0) - drag.startScrollTop;
          row.style.setProperty(
            "--manage-drag-offset-y",
            `${drag.latestY - drag.startY + scrollDelta + drag.layoutOffsetY}px`,
          );
        }

        return;
      }
      if (before === undefined || reducedMotion) {
        return;
      }
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) > 0.5) {
        row.animate(
          [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
          { duration: 170, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    });
  }, [dragPreview]);

  useEffect(
    () => () => {
      const drag = dragRef.current;
      if (drag !== null) {
        window.removeEventListener("pointermove", drag.onMove);
        window.removeEventListener("pointerup", drag.onEnd);
        window.removeEventListener("pointercancel", drag.onEnd);
      }
    },
    [],
  );

  if (search.view === "versions") {
    return (
      <section className="manage-day manage-day--versions" data-swipe-back-ignore="true">
        <header className="manage-day__app-bar">
          <button
            className="manage-day__back"
            onClick={() => void navigate({ to: "/plan/manage", search: { day }, replace: true })}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.9} />
            Manage day
          </button>
          <h1>Version history</h1>
          <span />
        </header>
        <div className="manage-day__versions-content">
          <div className="manage-day__context">
            <strong>Kyoto · {dayLabel}</strong>
            <span>Saving creates a restorable version.</span>
          </div>
          {dirty ? (
            <article className="version-entry version-entry--current">
              <span aria-hidden="true" className="version-entry__dot" />
              <div>
                <strong>Current draft</strong>
                <span>Autosaved · {draft.length} places</span>
              </div>
              <button
                onClick={() =>
                  void navigate({ to: "/plan/manage", search: { day }, replace: true })
                }
                type="button"
              >
                Continue editing
              </button>
            </article>
          ) : null}
          {versions.length === 0 ? (
            <p className="manage-day__versions-empty">
              Versions will appear after your first save.
            </p>
          ) : (
            versions.map((version) => (
              <article className="version-entry" key={version.id}>
                <span aria-hidden="true" className="version-entry__dot" />
                <div>
                  <strong>{formatVersionTime(version.savedAt)}</strong>
                  <span>
                    {version.summary} · {version.visits.length} places
                  </span>
                  <small>Saved on this device</small>
                </div>
                <button
                  onClick={() => {
                    commitDraft(version.visits, "Version restored to draft");
                    void navigate({ to: "/plan/manage", search: { day }, replace: true });
                  }}
                  type="button"
                >
                  Restore
                </button>
              </article>
            ))
          )}
          <p className="manage-day__version-note">
            Versions are created automatically when you save.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="manage-day" data-swipe-back-ignore="true">
      <header className="manage-day__app-bar">
        <button
          onClick={() => {
            if (selectionMode) {
              setSelectionMode(false);
              setSelectedIds(new Set());
            } else if (dirty) {
              setLeaveRequested(true);
            } else {
              exitToPlan();
            }
          }}
          type="button"
        >
          {selectionMode ? "Cancel selection" : "Cancel"}
        </button>
        <h1>{selectionMode ? "Select places" : "Manage day"}</h1>
        {selectionMode ? (
          <button
            onClick={() =>
              setSelectedIds(
                selectionCount === draft.length
                  ? new Set()
                  : new Set(draft.map((visit) => visit.placeId)),
              )
            }
            type="button"
          >
            {selectionCount === draft.length ? "Deselect all" : "Select all"}
          </button>
        ) : (
          <button disabled={!dirty || externalChange || saving} onClick={requestSave} type="button">
            Save
          </button>
        )}
      </header>

      <div className="manage-day__context">
        <strong>Kyoto · {dayLabel}</strong>
        <span>
          {externalChange
            ? "This day changed elsewhere. Reopen to use the latest plan."
            : draftStorageFailed
              ? "Draft is available only in this session"
              : dirty
                ? "Draft saved just now"
                : "No unsaved changes"}
        </span>
        {!selectionMode ? (
          <div className="manage-day__history-actions">
            <button
              aria-label="Undo"
              disabled={undoStack.length === 0}
              onClick={undo}
              type="button"
            >
              <Undo2 aria-hidden="true" size={21} strokeWidth={1.8} />
            </button>
            <button
              aria-label="Redo"
              disabled={redoStack.length === 0}
              onClick={redo}
              type="button"
            >
              <Redo2 aria-hidden="true" size={21} strokeWidth={1.8} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="manage-day__section-heading">
        <span>
          {draft.length} {draft.length === 1 ? "place" : "places"}
        </span>
        {selectionMode ? null : (
          <button
            onClick={() => {
              setSelectionMode(true);
              setSelectedIds(new Set());
            }}
            type="button"
          >
            Select
          </button>
        )}
      </div>

      <div aria-label={`${dayName} places`} className="manage-day__list" ref={listRef}>
        {displayedVisits.length === 0 ? (
          <div className="manage-day__empty">
            <strong>
              {dirty ? "All places removed from this draft" : "No places in this day"}
            </strong>
            <span>
              {dirty ? "Undo or save when you are ready." : "Return to Plan to add a place."}
            </span>
          </div>
        ) : (
          displayedVisits.map((visit) => {
            const stop = stops.get(visit.placeId);
            if (stop === undefined) {
              return null;
            }
            const selected = selectedIds.has(visit.placeId);

            return (
              <article
                className={`manage-day__row${selected ? " manage-day__row--selected" : ""}${draggedId === visit.placeId ? " manage-day__row--dragging" : ""}`}
                data-manage-row-id={visit.placeId}
                key={visit.placeId}
              >
                {selectionMode ? (
                  <button
                    aria-checked={selected}
                    aria-label={`Select ${stop.name}`}
                    className="manage-day__select-row"
                    onClick={() => {
                      const next = new Set(selectedIds);
                      if (selected) {
                        next.delete(visit.placeId);
                      } else {
                        next.add(visit.placeId);
                      }
                      setSelectedIds(next);
                    }}
                    role="checkbox"
                    type="button"
                  >
                    <span
                      className={`manage-day__checkbox${selected ? " manage-day__checkbox--checked" : ""}`}
                    >
                      {selected ? <Check aria-hidden="true" size={15} strokeWidth={2.4} /> : null}
                    </span>
                    <span className="manage-day__time">{visit.time || "Anytime"}</span>
                    <span className={`manage-day__icon manage-day__icon--${stop.category}`}>
                      {renderStopIcon(stop.category)}
                    </span>
                    <span className="manage-day__place">
                      <strong>{stop.name}</strong>
                      <span>{stop.type}</span>
                    </span>
                    <img alt="" src={stop.image} />
                  </button>
                ) : (
                  <>
                    <button
                      aria-describedby="manage-reorder-help"
                      aria-label={`Reorder ${stop.name}`}
                      className="manage-day__grip"
                      onKeyDown={(event) => {
                        if (
                          event.altKey &&
                          (event.key === "ArrowUp" || event.key === "ArrowDown")
                        ) {
                          event.preventDefault();
                          moveWithKeyboard(visit.placeId, event.key === "ArrowUp" ? -1 : 1);
                        }
                      }}
                      onPointerDown={(event) => startDrag(event, visit.placeId)}
                      type="button"
                    >
                      <GripVertical aria-hidden="true" size={19} strokeWidth={1.8} />
                    </button>
                    <span className="manage-day__time">{visit.time || "Anytime"}</span>
                    <span className={`manage-day__icon manage-day__icon--${stop.category}`}>
                      {renderStopIcon(stop.category)}
                    </span>
                    <span className="manage-day__place">
                      <strong>{stop.name}</strong>
                      <span>{stop.type}</span>
                    </span>
                    <img alt="" src={stop.image} />
                  </>
                )}
              </article>
            );
          })
        )}
      </div>

      <span className="sr-only" id="manage-reorder-help">
        Drag to reorder. With a keyboard, press Alt plus Arrow Up or Alt plus Arrow Down.
      </span>

      {selectionMode ? (
        selectionCount > 0 ? (
          <div className="manage-day__remove-bar">
            <button onClick={removeSelected} type="button">
              <Trash2 aria-hidden="true" size={20} strokeWidth={1.9} />
              Remove {selectionCount} {selectionCount === 1 ? "place" : "places"}
            </button>
          </div>
        ) : null
      ) : (
        <button
          className="manage-day__versions-link"
          onClick={() => void navigate({ to: "/plan/manage", search: { day, view: "versions" } })}
          type="button"
        >
          <History aria-hidden="true" size={20} strokeWidth={1.8} />
          Version history
          <span aria-hidden="true">›</span>
        </button>
      )}

      {draggedId === null ? null : (
        <div
          className={`manage-day__cancel-move${cancelMoveActive ? " manage-day__cancel-move--active" : ""}`}
        >
          <X aria-hidden="true" size={18} strokeWidth={2} />
          Cancel move
        </div>
      )}

      {notice === "" || draggedId !== null ? null : (
        <div className="manage-day__notice" role="status">
          <span>{notice}</span>
          {undoStack.length > 0 ? (
            <button onClick={undo} type="button">
              Undo
            </button>
          ) : null}
          <button aria-label="Dismiss message" onClick={() => setNotice("")} type="button">
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <dialog
        aria-labelledby="manage-day-leave-title"
        className="remove-stops-dialog manage-day__leave-dialog"
        ref={leaveDialogRef}
      >
        <h2 id="manage-day-leave-title">Leave Manage day?</h2>
        <p>Your draft can stay on this device so you can continue later.</p>
        <div className="manage-day__leave-actions">
          <button
            onClick={() => {
              setLeaveRequested(false);
              if (navigationBlocker.status === "blocked") {
                navigationBlocker.reset();
              }
            }}
            type="button"
          >
            Keep editing
          </button>
          <button onClick={discardAndExit} type="button">
            Discard
          </button>
          <button className="manage-day__primary" onClick={keepDraftAndExit} type="button">
            Keep draft
          </button>
        </div>
      </dialog>

      <dialog
        aria-labelledby="manage-day-save-title"
        className="remove-stops-dialog"
        ref={saveDialogRef}
      >
        <h2 id="manage-day-save-title">Save changes?</h2>
        <p>
          {removedCount} places will be removed from {dayLabel}. A restorable version will be
          created.
        </p>
        <div>
          <button onClick={() => setConfirmSave(false)} type="button">
            Keep editing
          </button>
          <button className="remove-stops-dialog__confirm" onClick={finishSave} type="button">
            Save changes
          </button>
        </div>
      </dialog>
    </section>
  );
}

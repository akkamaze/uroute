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
import { isSwipeBackEdgeStart } from "../navigation/swipe-back";

import { FRIDAY_STOPS } from "./plan-data";
import {
  addManageDayVersion,
  clearManageDayDraft,
  loadManageDayDraft,
  loadManageDayVersions,
  restoreAndSaveManageDayVersion,
  saveManageDayDraft,
  visitsSignature,
  type ManageDayVersion,
} from "./manage-day-store";
import { saveKyotoDay, useKyotoPlan, type PlannedVisit } from "./plan-store";
import { useManageDaySwipeBack } from "./use-manage-day-swipe-back";
import { createVersionDiff, type VersionPlaceDiff } from "./version-diff";
import "./manage-day.css";
import "./stop-actions.css";

const DAY_NAMES = new Map([
  [12, "Thursday"],
  [13, "Friday"],
  [14, "Saturday"],
  [15, "Sunday"],
  [16, "Monday"],
]);
const REMOVE_COMMIT_RATIO = 0.35;
const REMOVE_COMMIT_DURATION_MS = 180;

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

interface RowSwipeGesture {
  samples: Array<{ x: number; time: number }>;
  backEdge: boolean;
  currentOffset: number;
  direction: "pending" | "swipe" | "vertical";
  id: string;
  initialOffset: number;
  pointerId: number;
  startX: number;
  startY: number;
  surface: HTMLElement;
  width: number;
}

interface NoticeState {
  message: string;
  persistent: boolean;
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

interface RestoreVersionDialogProps {
  changedPlaceCount: number;
  hasDraft: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  version: ManageDayVersion | null;
}

function RestoreVersionDialog({
  changedPlaceCount,
  hasDraft,
  onCancel,
  onConfirm,
  version,
}: RestoreVersionDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && version !== null && !dialog.open) {
      dialog.showModal();
    } else if (dialog !== null && version === null && dialog.open) {
      dialog.close();
    }
  }, [version]);

  return (
    <dialog
      aria-labelledby="manage-day-restore-title"
      className="remove-stops-dialog manage-day__restore-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <h2 id="manage-day-restore-title">Restore and save this version?</h2>
      <p>
        {version === null ? null : `${formatVersionTime(version.savedAt)} · ${version.summary}. `}
        {changedPlaceCount} {changedPlaceCount === 1 ? "place" : "places"} will change. Your current
        saved plan will remain in Version history.
      </p>
      {hasDraft ? (
        <p className="manage-day__restore-warning">
          You have an unsaved draft. Restoring will replace it after the plan is saved.
        </p>
      ) : null}
      <div>
        <button onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="manage-day__primary" onClick={onConfirm} type="button">
          Restore &amp; save
        </button>
      </div>
    </dialog>
  );
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
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<PlannedVisit[] | null>(null);
  const [cancelMoveActive, setCancelMoveActive] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [leaveRequested, setLeaveRequested] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<ManageDayVersion | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [versionFilter, setVersionFilter] = useState<"all" | "changes">("all");
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const allowExitRef = useRef(false);
  const leaveDialogRef = useRef<HTMLDialogElement>(null);
  const saveDialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewAnimationRef = useRef<PreviewAnimation | null>(null);
  const rowSwipeRef = useRef<RowSwipeGesture | null>(null);
  const swipeRemovalTimerRef = useRef<number | undefined>(undefined);
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
  const swipeBackRef = useManageDaySwipeBack(() => {
    if (search.view === "versions" && search.version !== undefined) {
      void navigate({ to: "/plan/manage", search: { day, view: "versions" }, replace: true });
    } else if (search.view === "versions") {
      void navigate({ to: "/plan/manage", search: { day }, replace: true });
    } else if (dirty) {
      setLeaveRequested(true);
    } else {
      exitToPlan();
    }
  });

  function commitDraft(next: readonly PlannedVisit[], message: string): void {
    if (visitsSignature(next) === visitsSignature(draft)) {
      return;
    }
    setUndoStack((current) => [...current, cloneVisits(draft)]);
    setRedoStack([]);
    setDraft(cloneVisits(next));
    showNotice(message);
  }

  function showNotice(message: string, persistent = false): void {
    setNotice({ message, persistent });
  }

  function confirmRestoreVersion(): void {
    if (restoreCandidate === null) {
      return;
    }
    const result = restoreAndSaveManageDayVersion(
      day,
      plan.days[day],
      restoreCandidate,
      formatVersionTime(restoreCandidate.savedAt),
    );
    if (!result.ok) {
      setRestoreCandidate(null);
      setRestoreError(
        "Could not restore this version. Your saved plan and draft were not changed.",
      );

      return;
    }
    setVersions(result.versions);
    allowExitRef.current = true;
    setRestoreCandidate(null);
    void navigate({ to: "/plan", search: { day }, replace: true });
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    if (previous === undefined) {
      return;
    }
    setRedoStack((current) => [cloneVisits(draft), ...current]);
    setUndoStack((current) => current.slice(0, -1));
    setDraft(cloneVisits(previous));
    closeRowSwipe();
    showNotice("Last change undone");
  }

  function redo(): void {
    const next = redoStack[0];
    if (next === undefined) {
      return;
    }
    setUndoStack((current) => [...current, cloneVisits(draft)]);
    setRedoStack((current) => current.slice(1));
    setDraft(cloneVisits(next));
    closeRowSwipe();
    showNotice("Change restored");
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
      showNotice("Could not save. Your draft is still here.", true);

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

  function removeOneFromDraft(id: string): void {
    const stop = stops.get(id);
    previewAnimationRef.current = {
      before: captureRowRects(),
      draggedTop: null,
      sourceId: id,
    };
    closeRowSwipe();
    commitDraft(
      draft.filter((visit) => visit.placeId !== id),
      `${stop?.name ?? "Place"} removed from draft`,
    );
  }

  function closeRowSwipe(): void {
    window.clearTimeout(swipeRemovalTimerRef.current);
    swipeRemovalTimerRef.current = undefined;
    listRef.current?.querySelectorAll<HTMLElement>(".manage-day__row").forEach((row) => {
      row.classList.remove("manage-day__row--swiping");
      row.style.setProperty("--manage-row-swipe-x", "0px");
    });
    rowSwipeRef.current = null;
    setOpenSwipeId(null);
    setSwipeOffset(0);
  }

  function finishSwipeRemoval(id: string, destination: number): void {
    window.clearTimeout(swipeRemovalTimerRef.current);
    setOpenSwipeId(id);
    setSwipeOffset(destination);
    swipeRemovalTimerRef.current = window.setTimeout(() => {
      swipeRemovalTimerRef.current = undefined;
      removeOneFromDraft(id);
    }, REMOVE_COMMIT_DURATION_MS);
  }

  function startRowSwipe(event: React.PointerEvent<HTMLElement>, id: string): void {
    const target = event.target;
    if (
      selectionMode ||
      swipeRemovalTimerRef.current !== undefined ||
      event.button !== 0 ||
      !(target instanceof Element) ||
      target.closest("button") !== null
    ) {
      return;
    }
    if (openSwipeId !== null && openSwipeId !== id) {
      setOpenSwipeId(null);
      setSwipeOffset(0);
    }
    rowSwipeRef.current = {
      samples: [{ x: event.clientX, time: performance.now() }],
      backEdge: isSwipeBackEdgeStart(
        event.clientX,
        event.currentTarget.closest(".manage-day")?.getBoundingClientRect().left ?? 0,
      ),
      currentOffset: openSwipeId === id ? swipeOffset : 0,
      direction: "pending",
      id,
      initialOffset: openSwipeId === id ? swipeOffset : 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      surface: event.currentTarget,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveRowSwipe(event: React.PointerEvent<HTMLElement>): void {
    const gesture = rowSwipeRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.direction === "pending") {
      if (deltaX > 8 && gesture.initialOffset === 0 && gesture.backEdge) {
        rowSwipeRef.current = null;

        return;
      }
      if (Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        gesture.direction = "swipe";
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.surface.classList.add("manage-day__row--swiping");
      } else if (Math.abs(deltaY) >= 8 && Math.abs(deltaY) >= Math.abs(deltaX) / 1.2) {
        gesture.direction = "vertical";
      }
    }
    if (gesture.direction === "swipe") {
      event.preventDefault();
      const now = performance.now();
      gesture.samples = gesture.samples.filter((sample) => now - sample.time <= 120);
      gesture.samples.push({ x: event.clientX, time: now });
      gesture.currentOffset = Math.max(
        -gesture.width,
        Math.min(gesture.width, gesture.initialOffset + deltaX),
      );
      gesture.surface.style.setProperty("--manage-row-swipe-x", `${gesture.currentOffset}px`);
    }
  }

  function endRowSwipe(event: React.PointerEvent<HTMLElement>): void {
    const gesture = rowSwipeRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const wasSwipe = gesture.direction === "swipe";
    const finalOffset = Math.max(
      -gesture.width,
      Math.min(gesture.width, gesture.initialOffset + event.clientX - gesture.startX),
    );
    rowSwipeRef.current = null;
    if (!wasSwipe) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.surface.classList.remove("manage-day__row--swiping");
    const direction = finalOffset < 0 ? -1 : 1;
    const now = performance.now();
    const sample = gesture.samples.find((point) => now - point.time <= 120);
    const velocity =
      sample === undefined ? 0 : (event.clientX - sample.x) / Math.max(1, now - sample.time);
    const flick =
      Math.abs(finalOffset) >= 48 &&
      direction * (event.clientX - gesture.startX) >= 48 &&
      direction * velocity >= 0.65;
    if (Math.abs(finalOffset) >= gesture.width * REMOVE_COMMIT_RATIO || flick) {
      gesture.surface.style.setProperty("--manage-row-swipe-x", `${direction * gesture.width}px`);
      finishSwipeRemoval(gesture.id, direction * gesture.width);
    } else {
      gesture.surface.style.setProperty("--manage-row-swipe-x", "0px");
      closeRowSwipe();
    }
  }

  function cancelRowSwipe(event: React.PointerEvent<HTMLElement>): void {
    const gesture = rowSwipeRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    rowSwipeRef.current = null;
    gesture.surface.classList.remove("manage-day__row--swiping");
    gesture.surface.style.setProperty("--manage-row-swipe-x", `${gesture.initialOffset}px`);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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

  function isOverCancelMove(clientX: number, clientY: number): boolean {
    const target = document.querySelector<HTMLElement>(".manage-day__cancel-move");
    if (target === null) {
      return false;
    }
    const bounds = target.getBoundingClientRect();

    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    );
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, id: string): void {
    if (selectionMode || event.button !== 0) {
      return;
    }
    closeRowSwipe();
    event.preventDefault();
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
      if (!drag.active && Math.abs(pointerEvent.clientY - drag.startY) < 4) {
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
      drag.overCancel = isOverCancelMove(pointerEvent.clientX, pointerEvent.clientY);
      setCancelMoveActive(drag.overCancel);
      if (drag.overCancel) {
        // Keep the preview stable while hovering; restore only on cancellation.
        return;
      }
      const otherRows = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-manage-row-id]") ?? [],
      ).filter((row) => row.dataset.manageRowId !== id);
      const insertionIndex = otherRows.findIndex((row) => {
        const shell = row.parentElement ?? row;
        const transform = getComputedStyle(shell).transform;
        const animatedOffset = transform === "none" ? 0 : new DOMMatrix(transform).m42;

        return (
          pointerEvent.clientY <
          shell.getBoundingClientRect().top - animatedOffset + row.offsetHeight / 2
        );
      });
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
      const releasedOverCancel = isOverCancelMove(pointerEvent.clientX, pointerEvent.clientY);
      window.removeEventListener("pointermove", drag.onMove);
      window.removeEventListener("pointerup", drag.onEnd);
      window.removeEventListener("pointercancel", drag.onEnd);
      previewAnimationRef.current = {
        before: captureRowRects(),
        draggedTop: null,
        sourceId: id,
      };
      drag.surface?.style.setProperty("transition", "none");
      drag.surface?.style.removeProperty("--manage-drag-offset-y");
      dragRef.current = null;
      setDraggedId(null);
      setDragPreview(null);
      setCancelMoveActive(false);
      if (!drag.active || releasedOverCancel || pointerEvent.type === "pointercancel") {
        if (drag.active) {
          showNotice("Move cancelled");
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
    if (notice === null || notice.persistent) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 2_200);

    return () => window.clearTimeout(timer);
  }, [notice]);

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
      const shell = row.parentElement ?? row;
      shell.getAnimations().forEach((animation) => animation.cancel());
      const after = row.getBoundingClientRect();
      row.style.removeProperty("transition");
      const before = pending.before.get(id);
      if (id === pending.sourceId && dragRef.current !== null) {
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
        shell.animate(
          [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
          { duration: 170, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    });
  }, [draft, dragPreview, draggedId]);

  useEffect(
    () => () => {
      window.clearTimeout(swipeRemovalTimerRef.current);
      const drag = dragRef.current;
      if (drag !== null) {
        window.removeEventListener("pointermove", drag.onMove);
        window.removeEventListener("pointerup", drag.onEnd);
        window.removeEventListener("pointercancel", drag.onEnd);
      }
    },
    [],
  );

  function renderVersionPlace(
    placeDiff: VersionPlaceDiff,
    removed = false,
  ): React.JSX.Element | null {
    const stop = stops.get(placeDiff.placeId);
    if (stop === undefined) {
      return null;
    }

    return (
      <article
        className={`version-place${placeDiff.changes.length > 0 ? " version-place--changed" : ""}${removed ? " version-place--removed" : ""}`}
        data-version-row-id={placeDiff.placeId}
        key={placeDiff.placeId}
      >
        <div className="version-place__identity">
          <span className="version-place__position">{placeDiff.position + 1}</span>
          <span className={`manage-day__icon manage-day__icon--${stop.category}`}>
            {renderStopIcon(stop.category)}
          </span>
          <span className="manage-day__place">
            <strong>{stop.name}</strong>
            <span>{placeDiff.visit.time || "Anytime"}</span>
          </span>
          <img alt="" src={stop.image} />
        </div>
        {placeDiff.changes.length === 0 ? null : (
          <div className="version-place__changes">
            {placeDiff.changes.map((change) => (
              <div
                className={`version-place__change version-place__change--${change.kind}`}
                key={change.kind}
              >
                <strong>{change.label}</strong>
                {change.value === undefined ? (
                  <dl>
                    <div>
                      <dt>From</dt>
                      <dd>{change.from}</dd>
                    </div>
                    <div>
                      <dt>To</dt>
                      <dd>{change.to}</dd>
                    </div>
                  </dl>
                ) : (
                  <span>{change.value}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    );
  }

  if (search.view === "versions" && search.version !== undefined) {
    const previewVersion = versions.find((version) => version.id === search.version);
    const versionDiff =
      previewVersion === undefined
        ? null
        : createVersionDiff(plan.days[day], previewVersion.visits);
    const visiblePlaces =
      versionDiff === null || versionFilter === "all"
        ? (versionDiff?.places ?? [])
        : versionDiff.places.filter((place) => place.changes.length > 0);

    return (
      <section
        className="manage-day manage-day--version-preview"
        data-swipe-back-ignore="true"
        ref={swipeBackRef}
      >
        <header className="manage-day__app-bar">
          <button
            className="manage-day__back"
            onClick={() =>
              void navigate({
                to: "/plan/manage",
                search: { day, view: "versions" },
                replace: true,
              })
            }
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.9} />
            History
          </button>
          <h1>Version details</h1>
          <span />
        </header>
        {previewVersion === undefined ? (
          <div className="manage-day__version-missing">
            <strong>Version not available</strong>
            <span>It may have been removed from this device.</span>
            <button
              onClick={() =>
                void navigate({
                  to: "/plan/manage",
                  search: { day, view: "versions" },
                  replace: true,
                })
              }
              type="button"
            >
              Back to history
            </button>
          </div>
        ) : (
          <>
            <div className="version-preview__summary">
              <small>{dayLabel}</small>
              <strong>{formatVersionTime(previewVersion.savedAt)}</strong>
              <span>{previewVersion.summary}</span>
              <div className="version-preview__comparison">
                <span>Current saved plan</span>
                <span aria-hidden="true">→</span>
                <strong>This version</strong>
              </div>
              <p>
                {versionDiff?.changedPlaceCount ?? 0}{" "}
                {(versionDiff?.changedPlaceCount ?? 0) === 1
                  ? "place would change"
                  : "places would change"}
              </p>
            </div>
            <div className="version-preview__filters" role="group" aria-label="Filter places">
              <button
                aria-pressed={versionFilter === "all"}
                onClick={() => setVersionFilter("all")}
                type="button"
              >
                All places
              </button>
              <button
                aria-pressed={versionFilter === "changes"}
                onClick={() => setVersionFilter("changes")}
                type="button"
              >
                Changes only
              </button>
            </div>
            <div
              aria-label={`${formatVersionTime(previewVersion.savedAt)} places`}
              className="version-preview__list"
            >
              {visiblePlaces.map((place) => renderVersionPlace(place))}
              {versionDiff !== null && versionDiff.removed.length > 0 ? (
                <section
                  className="version-preview__removed"
                  aria-labelledby="removed-places-title"
                >
                  <h2 id="removed-places-title">Removed from this version</h2>
                  {versionDiff.removed.map((place) => renderVersionPlace(place, true))}
                </section>
              ) : null}
              {versionFilter === "changes" && versionDiff?.changedPlaceCount === 0 ? (
                <p className="version-preview__empty">This version matches your saved plan.</p>
              ) : null}
            </div>
            <div className="version-preview__restore-bar">
              {restoreError === "" ? null : (
                <p className="version-preview__error" role="alert">
                  {restoreError}
                </p>
              )}
              <button
                disabled={versionDiff?.changedPlaceCount === 0}
                onClick={() => {
                  setRestoreError("");
                  setRestoreCandidate(previewVersion);
                }}
                type="button"
              >
                {versionDiff?.changedPlaceCount === 0 ? "Already current" : "Restore & save"}
              </button>
              <span>Review first. Confirm once to save.</span>
            </div>
          </>
        )}
        <RestoreVersionDialog
          changedPlaceCount={versionDiff?.changedPlaceCount ?? 0}
          hasDraft={dirty}
          onCancel={() => setRestoreCandidate(null)}
          onConfirm={confirmRestoreVersion}
          version={restoreCandidate}
        />
      </section>
    );
  }

  if (search.view === "versions") {
    return (
      <section
        className="manage-day manage-day--versions"
        data-swipe-back-ignore="true"
        ref={swipeBackRef}
      >
        <header className="manage-day__app-bar">
          <button
            className="manage-day__back"
            onClick={() => void navigate({ to: "/plan/manage", search: { day }, replace: true })}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.9} />
            Edit plan
          </button>
          <h1>Version history</h1>
          <span />
        </header>
        <div className="manage-day__versions-content">
          <div className="manage-day__context">
            <strong>Kyoto · {dayLabel}</strong>
            <span>Open a version to compare it with your current saved plan.</span>
          </div>
          <article className="version-entry version-entry--current">
            <span aria-hidden="true" className="version-entry__dot" />
            <div className="version-entry__details">
              <strong>Current saved plan</strong>
              <span>{plan.days[day].length} places</span>
              <small>Active plan</small>
            </div>
          </article>
          {dirty ? (
            <article className="version-entry">
              <span aria-hidden="true" className="version-entry__dot" />
              <div className="version-entry__details">
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
                <div className="version-entry__details">
                  <strong>{formatVersionTime(version.savedAt)}</strong>
                  <span>
                    {version.summary} · {version.visits.length} places
                  </span>
                  <small>Saved on this device</small>
                </div>
                <div className="version-entry__actions">
                  <button
                    aria-label={`View version from ${formatVersionTime(version.savedAt)}`}
                    onClick={() => {
                      setVersionFilter("all");
                      setRestoreError("");
                      void navigate({
                        to: "/plan/manage",
                        search: { day, view: "versions", version: version.id },
                      });
                    }}
                    type="button"
                  >
                    View
                  </button>
                </div>
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
    <section className="manage-day" data-swipe-back-ignore="true" ref={swipeBackRef}>
      <header className="manage-day__app-bar">
        <button
          aria-label="Back to Plan"
          className="manage-day__back"
          onClick={() => {
            if (dirty) {
              setLeaveRequested(true);
            } else {
              exitToPlan();
            }
          }}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.9} />
          Plan
        </button>
        <h1>Edit plan</h1>
        <button
          disabled={selectionMode || !dirty || externalChange || saving}
          onClick={requestSave}
          type="button"
        >
          Save
        </button>
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
        {selectionMode ? (
          <span className="manage-day__section-actions">
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
            <button
              onClick={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              type="button"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => {
              closeRowSwipe();
              setSelectionMode(true);
              setSelectedIds(new Set());
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={18} strokeWidth={1.9} />
            Remove
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
          displayedVisits.map((visit, index) => {
            const stop = stops.get(visit.placeId);
            if (stop === undefined) {
              return null;
            }
            const selected = selectedIds.has(visit.placeId);

            const swipeOpen = openSwipeId === visit.placeId;

            return (
              <div
                className="manage-day__swipe-shell"
                data-swipe-back-ignore="true"
                key={visit.placeId}
              >
                <article
                  className={`manage-day__row${selected ? " manage-day__row--selected" : ""}${draggedId === visit.placeId ? " manage-day__row--dragging" : ""}${swipeOpen ? " manage-day__row--swipe-open" : ""}`}
                  data-manage-row-id={visit.placeId}
                  onLostPointerCapture={(event) => {
                    if (event.target === event.currentTarget) {
                      cancelRowSwipe(event);
                    }
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerCancel={(event) => cancelRowSwipe(event)}
                  onPointerDown={(event) => startRowSwipe(event, visit.placeId)}
                  onPointerMove={moveRowSwipe}
                  onPointerUp={endRowSwipe}
                  style={
                    {
                      "--manage-row-swipe-x": `${swipeOpen ? swipeOffset : 0}px`,
                    } as React.CSSProperties
                  }
                >
                  {selectionMode ? (
                    <button
                      aria-checked={selected}
                      aria-label={`Mark ${stop.name} for removal`}
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
                      <span className="manage-day__order" aria-hidden="true">
                        {index + 1}
                      </span>
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
                      <span className="manage-day__order" aria-hidden="true">
                        {index + 1}
                      </span>
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
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          startDrag(event, visit.placeId);
                        }}
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
              </div>
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

      <span aria-live="polite" className="sr-only" id="manage-day-change-announcement">
        {notice?.message ?? ""}
      </span>

      {notice === null || !notice.persistent || draggedId !== null ? null : (
        <div className="manage-day__notice" role="alert">
          <span>{notice.message}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button">
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        </div>
      )}

      <dialog
        aria-labelledby="manage-day-leave-title"
        className="remove-stops-dialog manage-day__leave-dialog"
        ref={leaveDialogRef}
      >
        <h2 id="manage-day-leave-title">Leave Edit plan?</h2>
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

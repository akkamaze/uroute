import { useNavigate, useSearch } from "@tanstack/react-router";
import { BookOpen, ChevronRight, PenLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./journal.css";

interface JournalDraft {
  date: string;
  id: number;
  note: string;
  title: string;
}
const JOURNAL_DRAFTS_KEY = "uroute.mock.journal-drafts";

function loadDrafts(): readonly JournalDraft[] {
  try {
    const stored = window.localStorage.getItem(JOURNAL_DRAFTS_KEY);
    if (stored === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (draft): draft is JournalDraft =>
        typeof draft === "object" &&
        draft !== null &&
        typeof (draft as Partial<JournalDraft>).date === "string" &&
        typeof (draft as Partial<JournalDraft>).id === "number" &&
        Number.isSafeInteger((draft as Partial<JournalDraft>).id) &&
        typeof (draft as Partial<JournalDraft>).note === "string" &&
        typeof (draft as Partial<JournalDraft>).title === "string",
    );
  } catch {
    return [];
  }
}

function formatDraftDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (value.length === 0 || Number.isNaN(date.getTime())) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
    date,
  );
}

interface JournalEditorProps {
  draft: JournalDraft | undefined;
  missing: boolean;
  open: boolean;
  onClose: () => void;
  onSave: (draft: JournalDraft) => boolean;
}

function JournalEditor({
  draft,
  missing,
  open,
  onClose,
  onSave,
}: JournalEditorProps): React.JSX.Element {
  const [title, setTitle] = useState(draft?.title ?? "");
  const [date, setDate] = useState(draft?.date ?? "2026-11-13");
  const [note, setNote] = useState(draft?.note ?? "");
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      titleInputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function saveDraft(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (title.trim().length === 0 || note.trim().length === 0) {
      setMessage("Add a title and a memory before saving.");

      return;
    }
    const saved = onSave({
      date,
      id: draft?.id ?? Date.now(),
      note: note.trim(),
      title: title.trim(),
    });
    if (!saved) {
      setMessage("Couldn't save on this device. Keep this page open and try again.");

      return;
    }
    if (draft === undefined) {
      setTitle("");
      setNote("");
    }
    setMessage("");
    onClose();
  }

  return (
    <dialog
      aria-labelledby="journal-editor-title"
      className="journal-editor"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="journal-editor__surface">
        <header>
          <h2 id="journal-editor-title">
            {missing
              ? "Memory unavailable"
              : draft === undefined
                ? "Write a memory"
                : "Edit memory"}
          </h2>
          <button aria-label="Close editor" onClick={onClose} type="button">
            <X aria-hidden="true" size={22} strokeWidth={1.8} />
          </button>
        </header>
        {missing ? (
          <p className="journal-editor__missing">This memory is no longer saved on this device.</p>
        ) : (
          <form onSubmit={saveDraft}>
            <label>
              Title
              <input
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="A morning in Kyoto"
                ref={titleInputRef}
                value={title}
              />
            </label>
            <label>
              Date
              <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
            </label>
            <label>
              Memory
              <textarea
                onChange={(event) => setNote(event.target.value)}
                placeholder="What made this moment special?"
                rows={5}
                value={note}
              />
            </label>
            {message.length > 0 ? (
              <p role="alert" className="journal-editor__message">
                {message}
              </p>
            ) : null}
            <button className="journal-editor__save" type="submit">
              {draft === undefined ? "Save draft" : "Save changes"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}

export function JournalPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/journal" });
  const editorOpen = search.editor === "open";
  const [drafts, setDrafts] = useState<readonly JournalDraft[]>(loadDrafts);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const openedHereRef = useRef(false);
  const wasEditorOpenRef = useRef(false);
  const activeDraft = drafts.find((draft) => draft.id === search.draft);

  useEffect(() => {
    if (editorOpen) {
      wasEditorOpenRef.current = true;

      return;
    }
    if (wasEditorOpenRef.current) {
      openerRef.current?.focus();
      wasEditorOpenRef.current = false;
      openedHereRef.current = false;
    }
  }, [editorOpen]);

  function openEditor(event: React.MouseEvent<HTMLButtonElement>, draft?: JournalDraft): void {
    openerRef.current = event.currentTarget;
    openedHereRef.current = true;
    void navigate({
      search: { editor: "open", ...(draft === undefined ? {} : { draft: draft.id }) },
      to: "/journal",
      resetScroll: false,
    });
  }
  function closeEditor(): void {
    if (openedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ replace: true, search: {}, to: "/journal", resetScroll: false });
    }
  }
  function saveDraft(draft: JournalDraft): boolean {
    const nextDrafts = drafts.some((item) => item.id === draft.id)
      ? drafts.map((item) => (item.id === draft.id ? draft : item))
      : [draft, ...drafts];
    try {
      window.localStorage.setItem(JOURNAL_DRAFTS_KEY, JSON.stringify(nextDrafts));
    } catch {
      return false;
    }
    setDrafts(nextDrafts);

    return true;
  }

  return (
    <section className="journal-page">
      <header className="journal-page__header">
        <div>
          <h1>Journal</h1>
          <p>Keep the moments you want to remember.</p>
        </div>
        {drafts.length > 0 ? (
          <button aria-label="Write a memory" onClick={(event) => openEditor(event)} type="button">
            <PenLine aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        ) : null}
      </header>
      {drafts.length === 0 ? (
        <div className="journal-empty">
          <span className="journal-empty__icon">
            <BookOpen aria-hidden="true" size={30} strokeWidth={1.7} />
          </span>
          <h2>Your stories start here</h2>
          <p>Write down a favorite place, meal or moment from your trip.</p>
          <button onClick={(event) => openEditor(event)} type="button">
            <PenLine aria-hidden="true" size={18} strokeWidth={1.8} />
            Write a memory
          </button>
        </div>
      ) : (
        <div className="journal-list">
          {drafts.map((draft) => (
            <button
              aria-label={`Edit ${draft.title}`}
              className="journal-entry"
              key={draft.id}
              onClick={(event) => openEditor(event, draft)}
              type="button"
            >
              <span className="journal-entry__copy">
                <span className="journal-entry__date">{formatDraftDate(draft.date)}</span>
                <strong>{draft.title}</strong>
                <span className="journal-entry__note">{draft.note}</span>
              </span>
              <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      )}
      <JournalEditor
        draft={activeDraft}
        key={search.draft ?? "new"}
        missing={search.draft !== undefined && activeDraft === undefined}
        onClose={closeEditor}
        onSave={saveDraft}
        open={editorOpen}
      />
    </section>
  );
}

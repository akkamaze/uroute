import { BookOpen, ChevronRight, PenLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./journal.css";

interface JournalDraft {
  date: string;
  id: number;
  note: string;
  title: string;
}

function formatDraftDate(value: string): string {
  if (value.length === 0) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function JournalPage(): React.JSX.Element {
  const [drafts, setDrafts] = useState<readonly JournalDraft[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("2026-11-13");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }

    titleInputRef.current?.focus();
  }, [editorOpen]);

  function closeEditor(): void {
    setEditorOpen(false);
    setMessage("");
  }

  function saveDraft(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (title.trim().length === 0 || note.trim().length === 0) {
      setMessage("Add a title and a memory before saving.");

      return;
    }

    setDrafts((currentDrafts) => [
      {
        date,
        id: Date.now(),
        note: note.trim(),
        title: title.trim(),
      },
      ...currentDrafts,
    ]);
    setTitle("");
    setNote("");
    setMessage("");
    setEditorOpen(false);
  }

  return (
    <section className="journal-page">
      <header className="journal-page__header">
        <div>
          <h1>Journal</h1>
          <p>Keep the moments you want to remember.</p>
        </div>

        {drafts.length > 0 ? (
          <button aria-label="Write a memory" onClick={() => setEditorOpen(true)} type="button">
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
          <button onClick={() => setEditorOpen(true)} type="button">
            <PenLine aria-hidden="true" size={18} strokeWidth={1.8} />
            Write a memory
          </button>
        </div>
      ) : (
        <div className="journal-list">
          {drafts.map((draft) => (
            <article className="journal-entry" key={draft.id}>
              <div>
                <span>{formatDraftDate(draft.date)}</span>
                <h2>{draft.title}</h2>
                <p>{draft.note}</p>
              </div>
              <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
            </article>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="journal-editor-backdrop" role="presentation">
          <section
            aria-labelledby="journal-editor-title"
            aria-modal="true"
            className="journal-editor"
            role="dialog"
          >
            <div className="journal-editor__handle" />
            <header>
              <h2 id="journal-editor-title">Write a memory</h2>
              <button aria-label="Close editor" onClick={closeEditor} type="button">
                <X aria-hidden="true" size={22} strokeWidth={1.8} />
              </button>
            </header>

            <form onSubmit={saveDraft}>
              <label>
                Title
                <input
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
                <p aria-live="polite" className="journal-editor__message">
                  {message}
                </p>
              ) : null}

              <button className="journal-editor__save" type="submit">
                Save draft
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

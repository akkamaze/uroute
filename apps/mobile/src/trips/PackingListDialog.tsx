import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import "../keyboard/keyboard-dialog.css";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./packing-list.css";

interface PackingItem {
  id: string;
  label: string;
  packed: boolean;
}
const MOCK_PACKING_KEY = "uroute.mock.packing.kyoto";
const DEFAULT_ITEMS: readonly PackingItem[] = [
  { id: "passport", label: "Passport or ID", packed: false },
  { id: "documents", label: "Travel documents", packed: false },
  { id: "wallet", label: "Wallet", packed: false },
  { id: "charger", label: "Phone and charger", packed: false },
  { id: "clothes", label: "Clothes and a light jacket", packed: false },
  { id: "toiletries", label: "Toiletries", packed: false },
];
function loadItems(storageKey: string): readonly PackingItem[] {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return DEFAULT_ITEMS;
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return DEFAULT_ITEMS;
    }
    const valid = parsed.filter(
      (item): item is PackingItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Partial<PackingItem>).id === "string" &&
        typeof (item as Partial<PackingItem>).label === "string" &&
        typeof (item as Partial<PackingItem>).packed === "boolean",
    );

    return valid.length > 0 ? valid : DEFAULT_ITEMS;
  } catch {
    return DEFAULT_ITEMS;
  }
}
interface PackingListDialogProps {
  open: boolean;
  onClose: () => void;
  tripId?: string;
  tripName: string;
}
export function PackingListDialog({
  open,
  onClose,
  tripId,
  tripName,
}: PackingListDialogProps): React.JSX.Element {
  const storageKey = tripId ? `uroute.real.packing.${tripId}` : MOCK_PACKING_KEY;
  const [items, setItems] = useState<readonly PackingItem[]>(() => loadItems(storageKey));
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollNewItemRef = useRef(false);
  const packedCount = items.filter((item) => item.packed).length;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  useEffect(() => {
    if (scrollNewItemRef.current) {
      const list = listRef.current;
      if (list !== null) {
        list.scrollTop = list.scrollHeight;
      }
      scrollNewItemRef.current = false;
    }
  }, [items.length]);
  function closeSurface(): void {
    if (beginDialogDismissal(dialogRef.current)) {
      onClose();
    }
  }

  function updateItems(next: readonly PackingItem[]): void {
    setItems(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setMessage("");
    } catch {
      setMessage("Kept for this session. Device storage is unavailable.");
    }
  }
  function addItem(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = label.trim();
    if (name.length === 0) {
      inputRef.current?.focus({ preventScroll: true });

      return;
    }
    if (items.some((item) => item.label.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage("This item is already on your list.");
      inputRef.current?.focus({ preventScroll: true });

      return;
    }
    scrollNewItemRef.current = true;
    updateItems([...items, { id: crypto.randomUUID(), label: name, packed: false }]);
    setLabel("");
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <dialog
      aria-labelledby="packing-title"
      className="packing-dialog"
      data-keyboard-dialog="sheet"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSurface();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeSurface();
        }
      }}
    >
      <div className="packing-dialog__surface">
        <header>
          <div>
            <h2 id="packing-title">Packing list</h2>
            <p>
              {tripName} · {packedCount} of {items.length} packed
            </p>
          </div>
          <button
            aria-label="Close packing list"
            className="packing-dialog__close"
            onClick={closeSurface}
            type="button"
          >
            <X aria-hidden="true" size={21} />
          </button>
        </header>
        <div aria-label="Items to pack" className="packing-dialog__items" ref={listRef}>
          {items.map((item) => (
            <label
              className={item.packed ? "packing-item packing-item--packed" : "packing-item"}
              key={item.id}
            >
              <input
                checked={item.packed}
                onChange={() =>
                  updateItems(
                    items.map((current) =>
                      current.id === item.id ? { ...current, packed: !current.packed } : current,
                    ),
                  )
                }
                type="checkbox"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <footer>
          <form className="packing-add" onSubmit={addItem}>
            <input
              aria-label="Add an item to pack"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={100}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Add an item"
              ref={inputRef}
              value={label}
            />
            <button aria-label="Add item" disabled={label.trim().length === 0} type="submit">
              <Plus aria-hidden="true" size={22} />
            </button>
          </form>
          {message.length > 0 ? (
            <p className="packing-dialog__message" role="status">
              {message}
            </p>
          ) : null}
        </footer>
      </div>
    </dialog>
  );
}

import { ArrowUpRight, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import "./stop-actions.css";

interface StopActionsDialogProps {
  dayLabel: string;
  inPlan: boolean;
  name: string;
  onClose: () => void;
  onOpenDetails: () => void;
  onRemove: () => void;
  open: boolean;
}

export function StopActionsDialog({
  dayLabel,
  inPlan,
  name,
  onClose,
  onOpenDetails,
  onRemove,
  open,
}: StopActionsDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
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

  return (
    <dialog
      aria-labelledby={titleId}
      className="stop-actions"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header>
        <div>
          <h2 id={titleId}>{name}</h2>
          <p>{dayLabel}</p>
        </div>
        <button
          aria-label="Close place options"
          className="stop-actions__close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </header>
      <button
        className="stop-actions__action"
        onClick={() => {
          dialogRef.current?.close();
          onOpenDetails();
        }}
        type="button"
      >
        <ArrowUpRight aria-hidden="true" size={20} strokeWidth={1.8} />
        View details
      </button>
      {inPlan ? (
        <button
          className="stop-actions__action stop-actions__action--remove"
          onClick={() => {
            dialogRef.current?.close();
            onRemove();
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" size={20} strokeWidth={1.8} />
          Remove from this day
        </button>
      ) : (
        <p className="stop-actions__unavailable">This place is no longer in this day.</p>
      )}
    </dialog>
  );
}

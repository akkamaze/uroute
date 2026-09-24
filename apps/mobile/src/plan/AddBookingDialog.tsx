import { ArrowLeft, Compass, Hotel, Plane, Ticket, TrainFront, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { advanceFormField } from "../keyboard/advance-form-field";
import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { trips, type TripSummary } from "../trips/trips-data";
import type { Booking } from "./bookings-data";
import {
  buildManualBooking,
  emptyManualBooking,
  validateManualBookingDates,
  type ManualBookingCategory,
  type ManualBookingDraft,
} from "./manual-booking";
import "./add-booking.css";

const CATEGORIES = [
  { id: "flight", label: "Flight", icon: Plane },
  { id: "stay", label: "Stay", icon: Hotel },
  { id: "train", label: "Train", icon: TrainFront },
  { id: "tickets", label: "Tickets", icon: Ticket },
] as const;

interface AddBookingDialogProps {
  open: boolean;
  trip: TripSummary | undefined;
  onClose: () => void;
  onAdded: (booking: Booking) => void;
}

interface BookingInputProps {
  draft: ManualBookingDraft;
  errorField: keyof ManualBookingDraft | null;
  errorMessage: string;
  field: keyof ManualBookingDraft;
  label: string;
  onChange: (field: keyof ManualBookingDraft, value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "date" | "time";
  maxLength?: number;
}

function BookingInput({
  draft,
  errorField,
  errorMessage,
  field,
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  maxLength,
}: BookingInputProps): React.JSX.Element {
  const invalid = errorField === field;

  return (
    <label className="add-booking__field">
      <span>
        {label} {required ? <em aria-label="required">*</em> : null}
      </span>
      <input
        aria-describedby={invalid ? `add-booking-error-${field}` : undefined}
        aria-invalid={invalid || undefined}
        maxLength={maxLength}
        name={field}
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={draft[field]}
      />
      {invalid ? (
        <small id={`add-booking-error-${field}`} role="alert">
          {errorMessage}
        </small>
      ) : null}
    </label>
  );
}

export function AddBookingDialog({
  open,
  trip,
  onClose,
  onAdded,
}: AddBookingDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(() =>
    emptyManualBooking(trip?.id, trip?.startDay, trip?.startDay),
  );
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selectedCategory, setSelectedCategory] = useState<ManualBookingCategory | null>(null);
  const [error, setError] = useState<{
    field: keyof ManualBookingDraft;
    message: string;
  } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      setDraft(emptyManualBooking(trip?.id, trip?.startDay, trip?.startDay));
      setStep(0);
      setSelectedCategory(null);
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, trip]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const field =
        step === 0
          ? (dialog?.querySelector<HTMLElement>('.add-booking__type[aria-pressed="true"]') ??
            dialog?.querySelector<HTMLElement>(".add-booking__type"))
          : step === 1
            ? (dialog?.querySelector<HTMLElement>('[name="tripId"]') ??
              dialog?.querySelector<HTMLElement>('[name="startDay"]'))
            : dialog?.querySelector<HTMLElement>(".add-booking-form__body input");
      field?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  function update(field: keyof ManualBookingDraft, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }));
    if (error?.field === field) {
      setError(null);
    }
  }

  function selectCategory(category: ManualBookingCategory): void {
    setSelectedCategory(category);
    setDraft((current) => ({
      ...current,
      category,
      endDay:
        category === "stay" && current.endDay === current.startDay
          ? ((trip ?? trips.find((candidate) => candidate.id === current.tripId))?.endDay ??
            current.endDay)
          : current.endDay,
    }));
    setError(null);
    setStep(1);
  }

  function selectTrip(tripId: string): void {
    const selected = trips.find((candidate) => candidate.id === tripId);
    setDraft((current) => {
      const previous = trips.find((candidate) => candidate.id === current.tripId);
      const useSuggestedDate = !current.startDay || current.startDay === previous?.startDay;

      return {
        ...current,
        tripId,
        startDay: useSuggestedDate ? (selected?.startDay ?? "") : current.startDay,
        endDay: useSuggestedDate
          ? current.category === "stay"
            ? (selected?.endDay ?? "")
            : (selected?.startDay ?? "")
          : current.endDay,
      };
    });
    if (error?.field === "tripId") {
      setError(null);
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 0) {
      return;
    }
    if (step === 1) {
      next();

      return;
    }
    const result = buildManualBooking(draft, `manual-${crypto.randomUUID()}`);
    if (result.error !== undefined) {
      setError({ field: result.field, message: result.error });
      formRef.current?.querySelector<HTMLElement>(`[name="${result.field}"]`)?.focus();

      return;
    }
    onAdded(result.booking);
  }

  function next(): void {
    const dateError = validateManualBookingDates(draft);
    if (dateError !== null) {
      setError({ field: dateError.field, message: dateError.error });
      formRef.current?.querySelector<HTMLElement>(`[name="${dateError.field}"]`)?.focus();

      return;
    }
    setError(null);
    setStep(2);
  }

  function back(): void {
    setError(null);
    setStep((current) => (current === 2 ? 1 : 0));
  }

  function dismiss(): void {
    if (beginDialogDismissal(dialogRef.current)) {
      onClose();
    }
  }

  const input = (
    field: keyof ManualBookingDraft,
    label: string,
    options: Pick<BookingInputProps, "placeholder" | "required" | "type" | "maxLength"> = {},
  ): React.JSX.Element => (
    <BookingInput
      draft={draft}
      errorField={error?.field ?? null}
      errorMessage={error?.message ?? ""}
      field={field}
      label={label}
      onChange={update}
      {...options}
    />
  );

  return (
    <dialog
      aria-labelledby="add-booking-title"
      className={`add-booking-dialog add-booking-dialog--step-${step}`}
      data-keyboard-dialog="center"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
      ref={dialogRef}
    >
      <form
        className="add-booking-form keyboard-dialog-form"
        noValidate
        onKeyDown={advanceFormField}
        onSubmit={save}
        ref={formRef}
      >
        <header>
          {step > 0 ? (
            <button aria-label="Previous step" onClick={back} type="button">
              <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          ) : null}
          <div>
            <h2 id="add-booking-title">
              {step === 0
                ? "Add booking"
                : step === 1
                  ? "Trip & dates"
                  : `${CATEGORIES.find((category) => category.id === draft.category)?.label ?? "Booking"} details`}
            </h2>
            <p>Step {step + 1} of 3</p>
          </div>
          <button aria-label="Close add booking" onClick={dismiss} type="button">
            <X aria-hidden="true" size={22} strokeWidth={1.8} />
          </button>
        </header>

        <div aria-label={`Step ${step + 1} of 3`} className="add-booking__progress">
          {[0, 1, 2].map((index) => (
            <span className={index <= step ? "is-active" : ""} key={index} />
          ))}
        </div>

        <div className="add-booking-form__body keyboard-dialog-body" data-keyboard-scroll>
          {step === 0 ? (
            <fieldset className="add-booking__categories">
              <legend>What are you adding?</legend>
              <div>
                {CATEGORIES.map(({ id, label, icon: Icon }) => (
                  <button
                    aria-pressed={selectedCategory === id}
                    className={
                      selectedCategory === id ? "add-booking__type is-active" : "add-booking__type"
                    }
                    key={id}
                    onClick={() => selectCategory(id)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {step === 1 && trip === undefined ? (
            <label className="add-booking__field">
              <span>
                Trip <em aria-label="required">*</em>
              </span>
              <select
                aria-describedby={
                  error?.field === "tripId" ? "add-booking-error-tripId" : undefined
                }
                aria-invalid={error?.field === "tripId" || undefined}
                name="tripId"
                onChange={(event) => selectTrip(event.target.value)}
                value={draft.tripId}
              >
                <option value="">Choose a trip</option>
                {trips.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.dateLabel}
                  </option>
                ))}
              </select>
              {error?.field === "tripId" ? (
                <small id="add-booking-error-tripId" role="alert">
                  {error.message}
                </small>
              ) : null}
            </label>
          ) : step === 1 && trip !== undefined ? (
            <p className="add-booking__trip-context">
              {trip.name} <span>· {trip.dateLabel}</span>
            </p>
          ) : null}

          {step === 1 && draft.category === "tickets" ? (
            <fieldset className="add-booking__ticket-kind">
              <legend>What kind of ticket?</legend>
              <div>
                <button
                  aria-pressed={draft.ticketKind === "ticket"}
                  onClick={() => update("ticketKind", "ticket")}
                  type="button"
                >
                  <Ticket aria-hidden="true" size={16} /> Ticket
                </button>
                <button
                  aria-pressed={draft.ticketKind === "pass"}
                  onClick={() => update("ticketKind", "pass")}
                  type="button"
                >
                  <Compass aria-hidden="true" size={16} /> Pass
                </button>
              </div>
            </fieldset>
          ) : null}

          {step === 2 && draft.category === "flight" ? (
            <>
              <div className="add-booking__paired add-booking__paired--airport">
                {input("fromName", "From city", { placeholder: "Bangkok", required: true })}
                {input("fromCode", "Airport code", {
                  placeholder: "BKK",
                  required: true,
                  maxLength: 3,
                })}
              </div>
              <div className="add-booking__paired add-booking__paired--airport">
                {input("toName", "To city", { placeholder: "Osaka", required: true })}
                {input("toCode", "Airport code", {
                  placeholder: "KIX",
                  required: true,
                  maxLength: 3,
                })}
              </div>
            </>
          ) : null}

          {step === 2 && draft.category === "stay"
            ? input("title", "Property name", {
                placeholder: "Where are you staying?",
                required: true,
              })
            : null}

          {step === 2 && draft.category === "train" ? (
            <>
              {input("title", "Train or service", { placeholder: "Train name", required: true })}
              {input("fromName", "From station", { required: true })}
              {input("toName", "To station", { required: true })}
            </>
          ) : null}

          {step === 2 && draft.category === "tickets"
            ? input("title", draft.ticketKind === "pass" ? "Pass name" : "Ticket name", {
                placeholder: "What is this for?",
                required: true,
              })
            : null}

          {step === 1 ? (
            <div className="add-booking__paired">
              {input(
                "startDay",
                draft.category === "stay"
                  ? "Check-in"
                  : draft.category === "tickets"
                    ? draft.ticketKind === "pass"
                      ? "Valid from"
                      : "Date"
                    : "Departure date",
                { type: "date", required: true },
              )}
              {draft.category !== "tickets" || draft.ticketKind === "pass"
                ? input(
                    "endDay",
                    draft.category === "stay"
                      ? "Check-out"
                      : draft.category === "tickets"
                        ? "Valid until"
                        : "Arrival date",
                    { type: "date", required: draft.category !== "tickets" },
                  )
                : null}
            </div>
          ) : null}

          {step === 2 && (draft.category === "flight" || draft.category === "train") ? (
            <div className="add-booking__paired">
              {input("startTime", "Departure local time", { type: "time", required: true })}
              {input("endTime", "Arrival local time", { type: "time", required: true })}
            </div>
          ) : step === 2 && draft.category === "tickets" && draft.ticketKind === "ticket" ? (
            input("startTime", "Entry time", { type: "time" })
          ) : null}

          {step === 2 && draft.category === "flight" ? (
            <div className="add-booking__paired">
              {input("airlineName", "Airline", { placeholder: "Optional" })}
              {input("service", "Flight number", { placeholder: "Optional" })}
            </div>
          ) : null}

          {step === 2 ? input("detail", "Notes", { placeholder: "Optional" }) : null}
          {step === 2 ? (
            <p className="add-booking__privacy">
              Saved on this device. Live booking updates are not connected.
            </p>
          ) : null}
        </div>

        {step > 0 ? (
          <div className="add-booking-form__footer">
            <button className="add-booking-form__back" onClick={back} type="button">
              Back
            </button>
            {step === 1 ? (
              <button className="add-booking-form__save" key="next" onClick={next} type="button">
                Next
              </button>
            ) : (
              <button className="add-booking-form__save" key="save" type="submit">
                Save booking
              </button>
            )}
          </div>
        ) : null}
      </form>
    </dialog>
  );
}

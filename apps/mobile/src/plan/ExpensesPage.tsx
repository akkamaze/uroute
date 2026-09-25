import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { advanceFormField } from "../keyboard/advance-form-field";
import "../keyboard/keyboard-dialog.css";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Hotel, Plus, TrainFront, Utensils, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type CreatedTrip } from "../trips/trip-store";
import { useRealTrips } from "../trips/use-real-trips";
import { TripHeader } from "./TripHeader";
import "./expenses.css";

const CATEGORIES = [
  { id: "stay", label: "Stay", icon: Hotel },
  { id: "transport", label: "Transport", icon: TrainFront },
  { id: "food", label: "Food & coffee", icon: Utensils },
  { id: "other", label: "Other", icon: Wallet },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];
interface Expense {
  id: string;
  amount: number;
  category: Category;
  description: string;
}
const INITIAL_EXPENSES: readonly Expense[] = [
  { id: "stay", amount: 60000, category: "stay", description: "The Celestine Kyoto Gion" },
  { id: "transport", amount: 6000, category: "transport", description: "Haruka Express" },
  { id: "food", amount: 2400, category: "food", description: "Lunch and coffee" },
];
const yen = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const CURRENCIES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : ["EUR", "JPY", "THB", "USD", "ZAR"];

function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

function loadTripExpenses(tripId: string): Expense[] {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(`uroute.trip-expenses.${tripId}`) ?? "[]",
    );

    if (!Array.isArray(data)) {
      return [];
    }
    const rows: unknown[] = data;

    return rows.filter((item): item is Expense => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const entry = item as Partial<Expense>;

      return (
        typeof entry.id === "string" &&
        typeof entry.amount === "number" &&
        Number.isFinite(entry.amount) &&
        entry.amount > 0 &&
        CATEGORIES.some(({ id }) => id === entry.category) &&
        typeof entry.description === "string"
      );
    });
  } catch {
    return [];
  }
}

function ExpenseScreen({ trip }: { trip?: CreatedTrip }): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const editorOpen = search.editor === "open";
  const [expenses, setExpenses] = useState<readonly Expense[]>(() =>
    trip ? loadTripExpenses(trip.id) : INITIAL_EXPENSES,
  );
  const [currency, setCurrency] = useState<string>(() => {
    const stored = trip ? localStorage.getItem(`uroute.trip-currency.${trip.id}`) : null;

    return trip ? (CURRENCIES.find((value) => value === stored) ?? "") : "JPY";
  });
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const openedHereRef = useRef(false);
  const wasOpenRef = useRef(false);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const money =
    trip && currency ? new Intl.NumberFormat("en", { style: "currency", currency }) : yen;

  useEffect(() => {
    if (trip) {
      localStorage.setItem(`uroute.trip-expenses.${trip.id}`, JSON.stringify(expenses));
      if (currency) {
        localStorage.setItem(`uroute.trip-currency.${trip.id}`, currency);
      }
    }
  }, [currency, expenses, trip]);

  function navigateExpense(open: boolean, replace = false): void {
    if (trip) {
      void navigate({
        to: "/plan/trip/$tripId/expenses",
        params: { tripId: trip.id },
        search: open ? { editor: "open" } : {},
        replace,
        resetScroll: false,
      });
    } else {
      void navigate({
        to: "/expenses",
        search: open ? { editor: "open" } : {},
        replace,
        resetScroll: false,
      });
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (editorOpen && !dialog.open) {
      wasOpenRef.current = true;
      dialog.showModal();
      descriptionRef.current?.focus();
    } else if (!editorOpen && wasOpenRef.current) {
      dialog.close();
      addButtonRef.current?.focus();
      wasOpenRef.current = false;
      openedHereRef.current = false;
    }
  }, [editorOpen]);

  function openEditor(): void {
    if (trip && !currency) {
      setError("Choose a currency before adding an expense.");

      return;
    }
    openedHereRef.current = true;
    setNotice("");
    navigateExpense(true);
  }

  function closeEditor(): void {
    if (!beginDialogDismissal(dialogRef.current)) {
      return;
    }
    setError("");
    if (openedHereRef.current) {
      window.history.back();
    } else {
      navigateExpense(false, true);
    }
  }

  function saveExpense(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!currency) {
      setError("Choose a currency before adding an expense.");

      return;
    }
    const value = Number(amount);
    if (description.trim().length === 0) {
      setError("Give this expense a name.");
      descriptionRef.current?.focus();

      return;
    }
    const digits = currencyDigits(currency);
    const amountPattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
    if (!amountPattern.test(amount) || !Number.isFinite(value) || value <= 0 || value > 9_999_999) {
      setError(
        digits === 0
          ? "Enter a whole amount up to 9,999,999."
          : `Enter an amount up to 9,999,999 with up to ${digits} decimal places.`,
      );

      return;
    }
    setExpenses((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        amount: Number(value.toFixed(digits)),
        category,
        description: description.trim(),
      },
    ]);
    setNotice(`${description.trim()} added to the estimate.`);
    setDescription("");
    setAmount("");
    closeEditor();
  }

  return (
    <section className="plan-page">
      <TripHeader active="expenses" trip={trip} />
      <div className="trip-secondary">
        <header className="trip-secondary__heading">
          <h2>Expenses</h2>
          <p>{trip ? `Planning estimate for ${trip.name}` : "Planning estimate for 4 travelers"}</p>
          {trip ? (
            <label>
              Currency{" "}
              <select
                aria-label="Expense currency"
                disabled={expenses.length > 0}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  setError("");
                }}
                value={currency}
              >
                <option value="">Choose currency</option>
                {CURRENCIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {expenses.length > 0 ? (
                <small>Currency is fixed after the first expense.</small>
              ) : null}
            </label>
          ) : null}
        </header>
        <section aria-label="Trip expense estimate" className="expense-total">
          <span>Planning estimate</span>
          <strong>{trip && !currency ? "Choose currency" : money.format(total)}</strong>
          {trip ? null : <p>4 people</p>}
        </section>
        <div className="expense-list">
          {expenses.map((expense) => {
            const details =
              CATEGORIES.find((item) => item.id === expense.category) ?? CATEGORIES[3];
            const Icon = details.icon;

            return (
              <article className="expense-row" key={expense.id}>
                <span className="expense-row__icon">
                  <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
                </span>
                <div>
                  <h3>{details.label}</h3>
                  <p>{expense.description}</p>
                </div>
                <strong>{currency ? money.format(expense.amount) : expense.amount}</strong>
              </article>
            );
          })}
        </div>
        <button className="expense-add" onClick={openEditor} ref={addButtonRef} type="button">
          <Plus aria-hidden="true" size={20} strokeWidth={1.9} />
          Add expense
        </button>
        {trip && !currency && error ? <p role="alert">{error}</p> : null}
        {notice.length > 0 ? (
          <p aria-live="polite" className="expense-notice">
            {notice}
          </p>
        ) : null}
      </div>
      <dialog
        aria-labelledby="expense-editor-title"
        className="expense-editor"
        data-keyboard-dialog="center"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeEditor();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeEditor();
          }
        }}
        ref={dialogRef}
      >
        <form
          className="keyboard-dialog-form"
          noValidate
          onKeyDown={advanceFormField}
          onSubmit={saveExpense}
        >
          <header>
            <div>
              <h2 id="expense-editor-title">Add expense</h2>
              <p>{trip ? `${trip.name} · ${currency}` : "Kyoto · Japanese yen"}</p>
            </div>
            <button
              aria-label="Close expense"
              className="expense-editor__close"
              onClick={closeEditor}
              type="button"
            >
              <X aria-hidden="true" size={21} />
            </button>
          </header>
          <div className="keyboard-dialog-body" data-keyboard-scroll>
            <label className="expense-editor__field">
              What was it for?
              <input
                autoComplete="off"
                enterKeyHint="next"
                maxLength={100}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={trip ? "Expense description" : "Lunch at Nishiki Market"}
                ref={descriptionRef}
                value={description}
              />
            </label>
            <label className="expense-editor__field">
              Amount
              <span className="expense-editor__amount">
                <span aria-hidden="true">{trip ? "" : "¥"}</span>
                <input
                  aria-describedby={error.length > 0 ? "expense-editor-error" : undefined}
                  enterKeyHint="done"
                  inputMode={currencyDigits(currency || "JPY") === 0 ? "numeric" : "decimal"}
                  maxLength={14}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  value={amount}
                />
                <span>{currency}</span>
              </span>
            </label>
            <fieldset className="expense-editor__categories">
              <legend>Category</legend>
              <div>
                {CATEGORIES.map((item) => {
                  const Icon = item.icon;

                  return (
                    <label
                      className={
                        category === item.id
                          ? "expense-category expense-category--selected"
                          : "expense-category"
                      }
                      key={item.id}
                    >
                      <input
                        checked={category === item.id}
                        name="expense-category"
                        onChange={() => setCategory(item.id)}
                        type="radio"
                        value={item.id}
                      />
                      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {error.length > 0 ? (
              <p className="expense-editor__error" id="expense-editor-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <button className="expense-add" type="submit">
            Add to estimate
          </button>
        </form>
      </dialog>
    </section>
  );
}

export function ExpensesPage(): React.JSX.Element {
  return <ExpenseScreen />;
}

export function CreatedTripExpensesPage(): React.JSX.Element {
  const { tripId } = useParams({ from: "/mobile-shell/plan/trip/$tripId/expenses" });
  const realTrips = useRealTrips();
  const trip = realTrips.trips.find((item) => item.id === tripId);

  return trip ? (
    <ExpenseScreen trip={trip} />
  ) : realTrips.loading ? (
    <section role="status">Loading trip…</section>
  ) : (
    <section>Trip not found.</section>
  );
}

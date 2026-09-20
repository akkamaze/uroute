import { beginDialogDismissal } from "../keyboard/dismiss-dialog";
import { advanceFormField } from "../keyboard/advance-form-field";
import "../keyboard/keyboard-dialog.css";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Hotel, Plus, TrainFront, Utensils, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

export function ExpensesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/expenses" });
  const editorOpen = search.editor === "open";
  const [expenses, setExpenses] = useState<readonly Expense[]>(INITIAL_EXPENSES);
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
    openedHereRef.current = true;
    setNotice("");
    void navigate({ to: "/expenses", search: { editor: "open" }, resetScroll: false });
  }

  function closeEditor(): void {
    if (!beginDialogDismissal(dialogRef.current)) {
      return;
    }
    setError("");
    if (openedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ to: "/expenses", search: {}, replace: true, resetScroll: false });
    }
  }

  function saveExpense(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = Number(amount);
    if (description.trim().length === 0) {
      setError("Give this expense a name.");
      descriptionRef.current?.focus();

      return;
    }
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(value) || value < 1 || value > 9999999) {
      setError("Enter an amount from ¥1 to ¥9,999,999, without decimals.");

      return;
    }
    setExpenses((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        amount: value,
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
      <TripHeader active="expenses" />
      <div className="trip-secondary">
        <header className="trip-secondary__heading">
          <h2>Expenses</h2>
          <p>Planning estimate for 4 travelers</p>
        </header>
        <section aria-label="Trip expense estimate" className="expense-total">
          <span>Planning estimate</span>
          <strong>{yen.format(total)}</strong>
          <p>4 people</p>
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
                <strong>{yen.format(expense.amount)}</strong>
              </article>
            );
          })}
        </div>
        <button className="expense-add" onClick={openEditor} ref={addButtonRef} type="button">
          <Plus aria-hidden="true" size={20} strokeWidth={1.9} />
          Add expense
        </button>
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
              <p>Kyoto · Japanese yen</p>
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
                placeholder="Lunch at Nishiki Market"
                ref={descriptionRef}
                value={description}
              />
            </label>
            <label className="expense-editor__field">
              Amount
              <span className="expense-editor__amount">
                <span aria-hidden="true">¥</span>
                <input
                  aria-describedby={error.length > 0 ? "expense-editor-error" : undefined}
                  enterKeyHint="done"
                  inputMode="numeric"
                  maxLength={7}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  value={amount}
                />
                <span>JPY</span>
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

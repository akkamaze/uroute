import { Hotel, Plus, TrainFront, Utensils } from "lucide-react";
import { useState } from "react";

import { TripHeader } from "./TripHeader";

const EXPENSES = [
  {
    amount: "¥60,000",
    detail: "The Celestine Kyoto Gion",
    icon: Hotel,
    title: "Stay",
  },
  {
    amount: "¥6,000",
    detail: "Haruka Express",
    icon: TrainFront,
    title: "Transport",
  },
  {
    amount: "¥2,400",
    detail: "Lunch and coffee",
    icon: Utensils,
    title: "Food & coffee",
  },
] as const;

export function ExpensesPage(): React.JSX.Element {
  const [notice, setNotice] = useState("");

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
          <strong>¥68,400</strong>
          <p>4 people</p>
        </section>

        <div className="expense-list">
          {EXPENSES.map((expense) => {
            const Icon = expense.icon;

            return (
              <article className="expense-row" key={expense.title}>
                <span className="expense-row__icon">
                  <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
                </span>
                <div>
                  <h3>{expense.title}</h3>
                  <p>{expense.detail}</p>
                </div>
                <strong>{expense.amount}</strong>
              </article>
            );
          })}
        </div>

        <button
          className="expense-add"
          onClick={() => setNotice("Expense entry is not connected yet.")}
          type="button"
        >
          <Plus aria-hidden="true" size={20} strokeWidth={1.9} />
          Add expense
        </button>
        <p aria-live="polite" className="expense-notice">
          {notice}
        </p>
      </div>
    </section>
  );
}

import { Hotel, Plane, TrainFront } from "lucide-react";

import { TripHeader } from "./TripHeader";

const BOOKINGS = [
  {
    date: "12 Nov · 08:30–15:55",
    detail: "BKK → KIX · TG672",
    icon: Plane,
    name: "Flight to Osaka",
  },
  {
    date: "12–16 Nov · 4 nights",
    detail: "2 rooms · 4 guests",
    icon: Hotel,
    name: "The Celestine Kyoto Gion",
  },
  {
    date: "16 Nov · 10:15–11:35",
    detail: "Kyoto → Kansai Airport",
    icon: TrainFront,
    name: "Haruka Express",
  },
] as const;

export function BookingsPage(): React.JSX.Element {
  return (
    <section className="plan-page">
      <TripHeader active="bookings" />

      <div className="trip-secondary">
        <header className="trip-secondary__heading">
          <h2>Bookings</h2>
          <p>Kyoto · 3 reservations</p>
        </header>

        <div className="booking-list">
          {BOOKINGS.map((booking) => {
            const Icon = booking.icon;

            return (
              <article className="booking-row" key={booking.name}>
                <span className="booking-row__icon">
                  <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
                </span>
                <div>
                  <h3>{booking.name}</h3>
                  <p>{booking.date}</p>
                  <span>{booking.detail}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

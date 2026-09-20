export interface PlannedStop {
  category: "coffee" | "food" | "temple";
  duration: string;
  id: string;
  image: string;
  name: string;
  time: string;
  travelAfter?: {
    detail: string;
    mode: "walk";
  };
  type: string;
}

export const FRIDAY_STOPS: readonly PlannedStop[] = [
  {
    category: "temple",
    duration: "1.5 hours",
    id: "kiyomizu",
    image: "/images/temple.png",
    name: "Kiyomizu-dera",
    time: "09:00",
    travelAfter: { detail: "18 min · 1.2 km", mode: "walk" },
    type: "Temple",
  },
  {
    category: "coffee",
    duration: "45 min",
    id: "arabica",
    image: "/images/coffee.png",
    name: "% Arabica Higashiyama",
    time: "11:00",
    travelAfter: { detail: "12 min · 800 m", mode: "walk" },
    type: "Coffee",
  },
  {
    category: "food",
    duration: "1 hour",
    id: "nishiki",
    image: "/images/market.png",
    name: "Nishiki Market",
    time: "12:30",
    type: "Lunch",
  },
];

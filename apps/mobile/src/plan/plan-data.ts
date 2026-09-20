export interface PlannedStop {
  address: string;
  area: string;
  category: "coffee" | "food" | "temple";
  duration: string;
  hours: string;
  id: string;
  image: string;
  name: string;
  rating: string;
  reviews: string;
  secondImage: string;
  time: string;
  travelAfter?: {
    detail: string;
    mode: "walk";
  };
  type: string;
}

export const FRIDAY_STOPS: readonly PlannedStop[] = [
  {
    address: "1-294 Kiyomizu, Higashiyama",
    area: "Higashiyama",
    category: "temple",
    duration: "1.5 hours",
    hours: "06:00–18:00",
    id: "kiyomizu",
    image: "/images/temple.png",
    name: "Kiyomizu-dera",
    rating: "4.6",
    reviews: "5,240",
    secondImage: "/images/kyoto.png",
    time: "09:00",
    travelAfter: { detail: "18 min · 1.2 km", mode: "walk" },
    type: "Temple",
  },
  {
    address: "87-5 Hoshinocho, Higashiyama",
    area: "Higashiyama",
    category: "coffee",
    duration: "45 min",
    hours: "09:00–18:00",
    id: "arabica",
    image: "/images/coffee.png",
    name: "% Arabica Higashiyama",
    rating: "4.4",
    reviews: "2,186",
    secondImage: "/images/kyoto.png",
    time: "11:00",
    travelAfter: { detail: "12 min · 800 m", mode: "walk" },
    type: "Coffee",
  },
  {
    address: "Nishikikoji-dori, Nakagyo",
    area: "Nakagyo",
    category: "food",
    duration: "1 hour",
    hours: "10:00–18:00",
    id: "nishiki",
    image: "/images/market.png",
    name: "Nishiki Market",
    rating: "4.3",
    reviews: "8,420",
    secondImage: "/images/kyoto.png",
    time: "12:30",
    type: "Lunch",
  },
];

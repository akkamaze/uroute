export type TripPeriod = "upcoming" | "past";

export interface TripSummary {
  id: string;
  startDay: string;
  endDay: string;
  dateLabel: string;
  durationLabel: string;
  featured: boolean;
  imageAlt: string;
  imageSrc: string;
  name: string;
  period: TripPeriod;
}

export const trips = [
  {
    id: "kyoto",
    startDay: "2026-11-12",
    endDay: "2026-11-16",
    dateLabel: "12–16 Nov 2026",
    durationLabel: "5 days",
    featured: true,
    imageAlt: "A sunny street and pagoda in Kyoto",
    imageSrc: "/images/kyoto.png",
    name: "Kyoto",
    period: "upcoming",
  },
  {
    id: "da-nang",
    startDay: "2026-12-04",
    endDay: "2026-12-07",
    dateLabel: "4–7 Dec 2026",
    durationLabel: "4 days",
    featured: false,
    imageAlt: "A beach in Da Nang",
    imageSrc: "/images/danang.png",
    name: "Da Nang",
    period: "upcoming",
  },
] as const satisfies readonly TripSummary[];

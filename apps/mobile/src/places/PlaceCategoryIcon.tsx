import {
  BedDouble,
  Camera,
  Coffee,
  Landmark,
  MapPin,
  Plane,
  ShoppingBag,
  Toilet,
  TreePine,
  Utensils,
} from "lucide-react";

import type { PlaceCategory } from "./place-category";

const ICONS = {
  unknown: MapPin,
  coffee: Coffee,
  food: Utensils,
  shopping: ShoppingBag,
  temple: Landmark,
  nature: TreePine,
  sightseeing: Camera,
  lodging: BedDouble,
  transport: Plane,
  restroom: Toilet,
} satisfies Record<PlaceCategory, typeof MapPin>;

export function PlaceCategoryIcon({
  category,
  size = 20,
}: {
  category: PlaceCategory;
  size?: number;
}): React.JSX.Element {
  const Icon = ICONS[category];

  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}

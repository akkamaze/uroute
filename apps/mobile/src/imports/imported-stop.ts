import type { PlannedStop } from "../plan/plan-data";
import type { ImportedPoint } from "./parse-place-file";

export function importedPointAsStop(point: ImportedPoint, time = ""): PlannedStop {
  return {
    address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    area: point.folder,
    category: "temple",
    duration: "",
    hours: "",
    id: point.id,
    image: "",
    name: point.name,
    rating: "",
    reviews: "",
    secondImage: "",
    time,
    type: "Imported place",
  };
}

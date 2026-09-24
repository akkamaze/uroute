import type { PlannedStop } from "../plan/plan-data";
import type { ImportedPoint } from "./parse-place-file";
import { displayImportedImageUrl, importedPlaceImages } from "./import-media";

export function importedPointAsStop(point: ImportedPoint, time = ""): PlannedStop {
  return {
    address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    area: point.folder,
    category: "temple",
    duration: "",
    hours: "",
    id: point.id,
    image: displayImportedImageUrl(importedPlaceImages(point)[0]) ?? "",
    name: point.name,
    rating: "",
    reviews: "",
    secondImage: "",
    time,
    type: "Imported place",
  };
}

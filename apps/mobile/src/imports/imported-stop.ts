import type { PlannedStop } from "../plan/plan-data";
import { effectivePlaceCategory, PLACE_CATEGORY_LABELS } from "../places/place-category";
import type { ImportedPoint } from "./parse-place-file";
import { displayImportedImageUrl, importedPlaceImages } from "./import-media";
import { loadOsmPhotoCache } from "./osm-photo";

export function importedPointAsStop(point: ImportedPoint, time = ""): PlannedStop {
  const category = effectivePlaceCategory(point);

  return {
    address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    area: point.folder,
    category,
    duration: "",
    hours: "",
    id: point.id,
    image:
      displayImportedImageUrl(
        importedPlaceImages(point)[0] ?? loadOsmPhotoCache()[point.id]?.photo?.imageUrl,
      ) ?? "",
    name: point.name,
    rating: "",
    reviews: "",
    secondImage: "",
    time,
    type: PLACE_CATEGORY_LABELS[category],
  };
}

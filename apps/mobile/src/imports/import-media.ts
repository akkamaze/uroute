import type { ImportedPoint } from "./parse-place-file";

export function isImageMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();

    return (
      (host === "mymaps.usercontent.google.com" && url.pathname.startsWith("/hostedimage/")) ||
      host.endsWith(".googleusercontent.com") ||
      /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function importedPlaceImages(point: ImportedPoint): string[] {
  return (point.mediaReferences ?? []).filter(isImageMediaUrl);
}

export function displayImportedImageUrl(value: string | undefined): string | undefined {
  if (value === undefined || !import.meta.env.DEV) {
    return value;
  }
  const url = new URL(value);
  if (
    url.hostname !== "mymaps.usercontent.google.com" ||
    !url.pathname.startsWith("/hostedimage/")
  ) {
    return value;
  }

  return `/_kml_images/${url.pathname.slice("/hostedimage/".length)}${url.search}`;
}

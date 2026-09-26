const MAX_WIDTH = 1600;

export function tripCoverUrl(tripId: string, coverVersion: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/cover?v=${encodeURIComponent(coverVersion)}`;
}

async function compressCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare the cover photo.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the cover photo."))),
      "image/jpeg",
      0.82,
    );
  });
}

export async function uploadTripCover(tripId: string, file: File): Promise<string> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/cover`, {
    method: "PUT",
    credentials: "same-origin",
    signal: AbortSignal.timeout(60_000),
    headers: { "content-type": "image/jpeg" },
    body: await compressCover(file),
  });
  if (!response.ok) {
    throw new Error(`Cover photo upload failed (${response.status}).`);
  }
  const result = (await response.json()) as { coverVersion: string };

  return result.coverVersion;
}

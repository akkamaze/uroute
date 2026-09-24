type MarkerKind = "pin" | "cluster";

/** Local 2x sprites keep labels sharp without a remote glyph service. */
export function createMapMarker(kind: MarkerKind, label: string, selected = false): ImageData {
  const canvas = document.createElement("canvas");
  const width = kind === "cluster" ? Math.max(44, 22 + label.length * 9) : selected ? 52 : 44;
  const height = kind === "cluster" ? 44 : selected ? 60 : 52;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Marker images are unavailable in this browser.");
  }
  context.scale(2, 2);
  context.shadowColor = "rgba(15, 42, 77, 0.24)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;
  context.beginPath();
  if (kind === "cluster") {
    context.roundRect(5, 5, width - 10, 34, 13);
  } else {
    const radius = selected ? 19 : 15;
    const centerX = width / 2;
    const centerY = radius + 5;
    context.moveTo(centerX, height - 5);
    context.bezierCurveTo(
      centerX - 6,
      height - 14,
      centerX - radius,
      centerY + 9,
      centerX - radius,
      centerY,
    );
    context.arc(centerX, centerY, radius, Math.PI, 0);
    context.bezierCurveTo(
      centerX + radius,
      centerY + 9,
      centerX + 6,
      height - 14,
      centerX,
      height - 5,
    );
    context.closePath();
  }
  context.fillStyle = kind === "cluster" ? "#ffffff" : selected ? "#084fc4" : "#1677ff";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = kind === "cluster" ? 1.5 : 2.5;
  context.strokeStyle = kind === "cluster" ? "#c6dcff" : "#ffffff";
  context.stroke();
  context.fillStyle = kind === "cluster" ? "#1256b8" : "#ffffff";
  context.font = `700 ${label.length > 3 ? 12 : selected ? 16 : 14}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (label.length > 0) {
    context.fillText(label, width / 2, kind === "cluster" ? 23 : selected ? 25 : 21);
  } else {
    context.beginPath();
    context.arc(width / 2, selected ? 24 : 20, 5, 0, Math.PI * 2);
    context.fill();
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Small category medallions distinguish exploration from itinerary order. */
export function createCategoryMarker(category: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Marker images are unavailable in this browser.");
  }
  context.scale(2, 2);
  context.beginPath();
  context.arc(18, 18, 14, 0, Math.PI * 2);
  context.fillStyle =
    category === "coffee" ? "#98653b" : category === "food" ? "#cf7736" : "#4679a8";
  context.shadowColor = "rgba(15, 42, 77, 0.22)";
  context.shadowBlur = 5;
  context.shadowOffsetY = 2;
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.stroke();
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (category === "coffee") {
    context.moveTo(12, 14);
    context.lineTo(22, 14);
    context.lineTo(21, 22);
    context.lineTo(13, 22);
    context.closePath();
    context.moveTo(22, 15);
    context.bezierCurveTo(27, 14, 27, 20, 22, 20);
    context.moveTo(12, 25);
    context.lineTo(23, 25);
  } else if (category === "temple") {
    context.moveTo(11, 15);
    context.lineTo(18, 10);
    context.lineTo(25, 15);
    context.closePath();
    context.moveTo(12, 24);
    context.lineTo(24, 24);
    for (const x of [14, 18, 22]) {
      context.moveTo(x, 17);
      context.lineTo(x, 22);
    }
  } else if (category === "food") {
    context.roundRect(12, 15, 12, 11, 1);
    context.moveTo(15, 15);
    context.lineTo(15, 12);
    context.bezierCurveTo(15, 9, 21, 9, 21, 12);
    context.lineTo(21, 15);
  } else {
    context.arc(18, 18, 4, 0, Math.PI * 2);
  }
  context.stroke();

  return context.getImageData(0, 0, 72, 72);
}

const LABEL_FONT = "600 11px Arial";
const LABEL_TEXT_WIDTH = 108;
const LABEL_LAYOUT_CACHE_LIMIT = 2_048;

interface MapLabelLayout {
  label: string;
  width: number;
}

const labelLayoutCache = new Map<string, MapLabelLayout>();

function createMapLabelLayout(name: string): MapLabelLayout {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    return { label: name, width: LABEL_TEXT_WIDTH + 8 };
  }
  context.font = LABEL_FONT;
  const remaining = Array.from(name.trim());
  const lines: string[] = [];
  for (let row = 0; row < 2 && remaining.length > 0; row += 1) {
    let line = "";
    while (
      remaining.length > 0 &&
      context.measureText(line + remaining[0]).width <= LABEL_TEXT_WIDTH
    ) {
      line += remaining.shift();
    }
    if (row === 0 && remaining.length > 0 && line.includes(" ")) {
      const lastSpace = line.lastIndexOf(" ");
      remaining.unshift(...Array.from(line.slice(lastSpace + 1)));
      line = line.slice(0, lastSpace);
    }
    if (row === 1 && remaining.length > 0) {
      while (context.measureText(line + "…").width > LABEL_TEXT_WIDTH) {
        line = Array.from(line).slice(0, -1).join("");
      }
      line = line.trimEnd() + "…";
    }
    lines.push(line.trim());
    while (remaining[0] === " ") {
      remaining.shift();
    }
  }

  const label = lines.join("\n");
  const textWidth = Math.max(0, ...lines.map((line) => context.measureText(line).width));

  return { label, width: Math.ceil(Math.min(LABEL_TEXT_WIDTH, textWidth)) + 8 };
}

function getMapLabelLayout(name: string): MapLabelLayout {
  const cachedLayout = labelLayoutCache.get(name);
  if (cachedLayout !== undefined) {
    return cachedLayout;
  }
  const layout = createMapLabelLayout(name);
  if (labelLayoutCache.size >= LABEL_LAYOUT_CACHE_LIMIT) {
    const oldestName = labelLayoutCache.keys().next().value;
    if (oldestName !== undefined) {
      labelLayoutCache.delete(oldestName);
    }
  }
  labelLayoutCache.set(name, layout);

  return layout;
}

export function getMapLabel(name: string): string {
  return getMapLabelLayout(name).label;
}

export function getMapLabelWidth(name: string): number {
  return getMapLabelLayout(name).width;
}

export function createNameLabel(name: string): ImageData {
  const layout = getMapLabelLayout(name);
  const lines = layout.label.split("\n");
  const canvas = document.createElement("canvas");
  canvas.width = layout.width * 2;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Map labels are unavailable in this browser.");
  }
  context.scale(2, 2);
  context.font = LABEL_FONT;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 3.5;
  context.strokeStyle = "rgba(255,255,255,0.97)";
  context.fillStyle = "#24364b";
  lines.forEach((line, index) => {
    const y = lines.length === 1 ? 18 : 11 + index * 13;
    context.strokeText(line, 4, y);
    context.fillText(line, 4, y);
  });

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

const photoCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  let photo = photoCache.get(url);
  if (photo === undefined) {
    photo = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    photoCache.set(url, photo);
  }

  return photo;
}

export async function createPlaceHead(
  category: string,
  imageUrl: string | undefined,
  number: string | undefined,
  selected: boolean,
  searchResult = false,
): Promise<ImageData> {
  // My Maps images lack CORS headers; TripMap displays them as DOM photo overlays instead.
  const photo =
    imageUrl === undefined ||
    number !== undefined ||
    imageUrl.startsWith("https://mymaps.usercontent.google.com/hostedimage/")
      ? null
      : await loadPhoto(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Map markers are unavailable in this browser.");
  }
  context.scale(2, 2);
  if (photo === null && number === undefined) {
    const fallback = document.createElement("canvas");
    fallback.width = 72;
    fallback.height = 72;
    fallback.getContext("2d")?.putImageData(createCategoryMarker(category), 0, 0);
    context.drawImage(fallback, 2, 2, 36, 36);
  } else {
    context.save();
    context.beginPath();
    context.arc(20, 20, 14, 0, Math.PI * 2);
    context.clip();
    if (photo !== null) {
      const side = Math.min(photo.naturalWidth, photo.naturalHeight);
      context.drawImage(
        photo,
        (photo.naturalWidth - side) / 2,
        (photo.naturalHeight - side) / 2,
        side,
        side,
        6,
        6,
        28,
        28,
      );
    } else {
      context.fillStyle = "#1677ff";
      context.fillRect(6, 6, 28, 28);
      context.fillStyle = "#fff";
      context.font = "700 13px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(number ?? "", 20, 20.5);
    }
    context.restore();
    context.beginPath();
    context.arc(20, 20, 14, 0, Math.PI * 2);
    context.strokeStyle = "#fff";
    context.lineWidth = 2;
    context.stroke();
  }
  if (selected || searchResult) {
    context.beginPath();
    context.arc(20, 20, 16.5, 0, Math.PI * 2);
    context.strokeStyle = searchResult ? "#f59e0b" : "#1677ff";
    context.lineWidth = searchResult ? 2.5 : 1.5;
    context.stroke();
  }

  return context.getImageData(0, 0, 80, 80);
}

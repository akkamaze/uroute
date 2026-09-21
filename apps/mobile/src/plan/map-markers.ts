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
  context.arc(18, 18, 12, 0, Math.PI * 2);
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

export function getMapLabel(name: string): string {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    return name;
  }
  context.font = LABEL_FONT;
  if (context.measureText(name).width <= LABEL_TEXT_WIDTH) {
    return name;
  }
  const letters = Array.from(name);
  while (
    letters.length > 0 &&
    context.measureText(letters.join("") + "…").width > LABEL_TEXT_WIDTH
  ) {
    letters.pop();
  }

  return letters.join("").trimEnd() + "…";
}

export function createNameLabel(name: string): ImageData {
  const label = getMapLabel(name);
  const canvas = document.createElement("canvas");
  canvas.width = 248;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Map labels are unavailable in this browser.");
  }
  context.scale(2, 2);
  context.font = LABEL_FONT;
  const width = Math.min(120, context.measureText(label).width + 12);
  context.fillStyle = "rgba(255,255,255,0.96)";
  context.beginPath();
  context.roundRect((124 - width) / 2, 2, width, 20, 6);
  context.fill();
  context.strokeStyle = "rgba(117,139,163,0.24)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "#24364b";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 62, 12.5);

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

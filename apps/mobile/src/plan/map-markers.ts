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

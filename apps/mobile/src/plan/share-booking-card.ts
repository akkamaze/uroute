import type { Booking } from "./bookings-data";
import shareSkyUrl from "./share-sky.svg";

type ShareResult = "shared" | "downloaded" | "cancelled";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const CARD_WIDTH = 900;
const NOTCH_RADIUS = 13;

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Frame {
  left: number;
  top: number;
  scale: number;
}

type PaintOperation = { z: number; order: number; paint: () => Promise<void> | void };

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

async function loadImage(url: string, crossOrigin = false): Promise<HTMLImageElement | null> {
  const image = new Image();
  if (crossOrigin) {
    image.crossOrigin = "anonymous";
  }
  image.src = url;
  try {
    await image.decode();

    return image;
  } catch {
    return null;
  }
}

function transparent(color: string): boolean {
  return color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);
}

function box(element: Element, frame: Frame, root: DOMRect): Area {
  const rect = element.getBoundingClientRect();

  return {
    x: frame.left + (rect.left - root.left) * frame.scale,
    y: frame.top + (rect.top - root.top) * frame.scale,
    width: rect.width * frame.scale,
    height: rect.height * frame.scale,
  };
}

function stackLevel(element: Element, root: Element): number {
  let current: Element | null = element;
  while (current !== null && current !== root) {
    const zIndex = getComputedStyle(current).zIndex;
    if (zIndex !== "auto") {
      return Number(zIndex) || 0;
    }
    current = current.parentElement;
  }

  return 0;
}

function gradientLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") {
      depth += 1;
    } else if (value[index] === ")") {
      depth -= 1;
    } else if (value[index] === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());

  return layers.filter((layer) => layer.includes("gradient("));
}

function gradientStops(layer: string): { color: string; offset: number | null }[] {
  return [...layer.matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})(?:\s+([\d.]+)%)?/gi)].map((match) => ({
    color: match[1]!,
    offset: match[2] === undefined ? null : Number(match[2]) / 100,
  }));
}

function clearOf(color: string): string {
  const channels = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);

  return channels ? `rgba(${channels[1]}, ${channels[2]}, ${channels[3]}, 0)` : color;
}

function paintGradient(context: CanvasRenderingContext2D, layer: string, area: Area): void {
  const stops = gradientStops(layer).map((stop, index, all) =>
    transparent(stop.color)
      ? { ...stop, color: clearOf((all[index - 1] ?? all[index + 1] ?? stop).color) }
      : stop,
  );
  if (stops.length < 2) {
    return;
  }
  let gradient: CanvasGradient;
  if (layer.startsWith("radial-gradient")) {
    const position = /at\s+([\d.]+)%\s+([\d.]+)%/.exec(layer);
    const cx = area.x + (area.width * Number(position?.[1] ?? 50)) / 100;
    const cy = area.y + (area.height * Number(position?.[2] ?? 50)) / 100;
    const rx = Math.max(cx - area.x, area.x + area.width - cx) * Math.SQRT2;
    const ry = Math.max(cy - area.y, area.y + area.height - cy) * Math.SQRT2;
    context.save();
    context.translate(cx, cy);
    context.scale(1, ry / rx);
    gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
    stops.forEach((stop, index) =>
      gradient.addColorStop(stop.offset ?? index / (stops.length - 1), stop.color),
    );
    context.fillStyle = gradient;
    context.fillRect(-rx, -rx, rx * 2, rx * 2);
    context.restore();

    return;
  }
  const vertical = /180deg/.test(layer);
  gradient = context.createLinearGradient(
    area.x,
    area.y,
    vertical ? area.x : area.x + area.width,
    area.y + area.height,
  );
  stops.forEach((stop, index) =>
    gradient.addColorStop(stop.offset ?? index / (stops.length - 1), stop.color),
  );
  context.fillStyle = gradient;
  context.fillRect(area.x, area.y, area.width, area.height);
}

function paintBackground(
  context: CanvasRenderingContext2D,
  element: Element,
  frame: Frame,
  root: DOMRect,
): (() => Promise<void>) | null {
  const style = getComputedStyle(element);
  const area = box(element, frame, root);
  const shape =
    element instanceof HTMLImageElement && element.parentElement !== null
      ? getComputedStyle(element.parentElement)
      : style;
  const radius = (Number.parseFloat(shape.borderTopLeftRadius) || 0) * frame.scale;
  const gradients = gradientLayers(style.backgroundImage);
  const artworkMatch = /url\("([^"]+)"\)|url\(([^)"]+)\)/.exec(style.backgroundImage);
  const artwork = artworkMatch?.[1] ?? artworkMatch?.[2];
  const dashed = style.borderTopStyle === "dashed" && Number.parseFloat(style.borderTopWidth) > 0;
  if (transparent(style.backgroundColor) && gradients.length === 0 && !artwork && !dashed) {
    return null;
  }

  return async () => {
    if (!transparent(style.backgroundColor)) {
      context.fillStyle = style.backgroundColor;
      roundedRect(context, area.x, area.y, area.width, area.height, radius);
      context.fill();
    }
    if (gradients.length > 0) {
      context.save();
      roundedRect(context, area.x, area.y, area.width, area.height, radius);
      context.clip();
      [...gradients].reverse().forEach((layer) => paintGradient(context, layer, area));
      context.restore();
    }
    if (artwork) {
      const image = await loadImage(artwork);
      if (image !== null) {
        context.drawImage(image, area.x, area.y, area.width, area.height);
      }
    }
    if (dashed) {
      const width = Number.parseFloat(style.borderTopWidth) * frame.scale;
      context.save();
      context.strokeStyle = style.borderTopColor;
      context.lineWidth = width;
      const dash = width * 3;
      const count = Math.max(1, Math.floor((area.width + width * 2) / (dash + width * 2)));
      const gap = count > 1 ? (area.width - count * dash) / (count - 1) : 0;
      context.setLineDash([dash, gap]);
      context.beginPath();
      context.moveTo(area.x, area.y + width / 2);
      context.lineTo(area.x + area.width, area.y + width / 2);
      context.stroke();
      context.restore();
    }
  };
}

function paintText(
  context: CanvasRenderingContext2D,
  node: Text,
  frame: Frame,
  root: DOMRect,
): () => void {
  return () => {
    const parent = node.parentElement;
    if (parent === null) {
      return;
    }
    const style = getComputedStyle(parent);
    const size = Number.parseFloat(style.fontSize) * frame.scale;
    context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    context.fillStyle = style.color;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    const metrics = context.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    const range = document.createRange();
    const text = node.data;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      if (/\s/.test(character)) {
        continue;
      }
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (rect === undefined || rect.width === 0) {
        continue;
      }
      const top = frame.top + (rect.top - root.top) * frame.scale;
      const height = rect.height * frame.scale;
      context.fillText(
        style.textTransform === "uppercase" ? character.toUpperCase() : character,
        frame.left + (rect.left - root.left) * frame.scale,
        top + (height - ascent - descent) / 2 + ascent,
      );
    }
  };
}

function paintVector(
  context: CanvasRenderingContext2D,
  element: SVGSVGElement,
  frame: Frame,
  root: DOMRect,
): () => Promise<void> {
  return async () => {
    const area = box(element, frame, root);
    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(area.width));
    clone.setAttribute("height", String(area.height));
    clone.setAttribute("style", `color: ${getComputedStyle(element).color}`);
    const markup = new XMLSerializer().serializeToString(clone);
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    if (image !== null) {
      context.drawImage(image, area.x, area.y, area.width, area.height);
    }
  };
}

function paintPicture(
  context: CanvasRenderingContext2D,
  element: HTMLImageElement,
  frame: Frame,
  root: DOMRect,
): () => Promise<void> {
  return async () => {
    if (element.hidden || element.naturalWidth === 0) {
      return;
    }
    const image = await loadImage(element.currentSrc || element.src, true);
    if (image === null) {
      return;
    }
    const area = box(element, frame, root);
    const ratio = Math.min(area.width / image.naturalWidth, area.height / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    const radius =
      (Number.parseFloat(getComputedStyle(element.parentElement ?? element).borderTopLeftRadius) ||
        0) * frame.scale;
    context.save();
    roundedRect(context, area.x, area.y, area.width, area.height, radius);
    context.clip();
    context.drawImage(
      image,
      area.x + (area.width - width) / 2,
      area.y + (area.height - height) / 2,
      width,
      height,
    );
    context.restore();
  };
}

function visible(element: Element): boolean {
  const style = getComputedStyle(element);

  return style.display !== "none" && style.visibility !== "hidden";
}

export async function drawBookingCard(ticket: HTMLElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Image canvas is unavailable.");
  }
  await document.fonts.ready;
  const sky = await loadImage(shareSkyUrl);
  if (sky !== null) {
    context.drawImage(sky, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    context.fillStyle = "#dfedfc";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  const backdrop = document.createElement("canvas");
  backdrop.width = CANVAS_WIDTH;
  backdrop.height = CANVAS_HEIGHT;
  backdrop.getContext("2d")?.drawImage(canvas, 0, 0);

  const root = ticket.getBoundingClientRect();
  const scale = CARD_WIDTH / root.width;
  const frame: Frame = {
    left: (CANVAS_WIDTH - CARD_WIDTH) / 2,
    top: Math.max(0, (CANVAS_HEIGHT - root.height * scale) / 2),
    scale,
  };
  const rootStyle = getComputedStyle(ticket);
  const radius = (Number.parseFloat(rootStyle.borderTopLeftRadius) || 0) * scale;
  context.save();
  context.shadowColor = "rgb(38 83 132 / 13%)";
  context.shadowBlur = 55 * scale;
  context.shadowOffsetY = 18 * scale;
  context.fillStyle = "#ffffff";
  roundedRect(context, frame.left, frame.top, CARD_WIDTH, root.height * scale, radius);
  context.fill();
  context.restore();

  const operations: PaintOperation[] = [];
  const rootBackground = paintBackground(context, ticket, frame, root);
  if (rootBackground !== null) {
    operations.push({ z: -1, order: -1, paint: rootBackground });
  }
  const walker = document.createTreeWalker(ticket, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let order = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    order += 1;
    if (node instanceof Text) {
      if (node.data.trim() !== "" && node.parentElement && visible(node.parentElement)) {
        operations.push({
          z: stackLevel(node.parentElement, ticket),
          order,
          paint: paintText(context, node, frame, root),
        });
      }
      continue;
    }
    if (!(node instanceof Element) || !visible(node)) {
      continue;
    }
    const z = stackLevel(node, ticket);
    const background = paintBackground(context, node, frame, root);
    if (background !== null) {
      operations.push({ z, order, paint: background });
    }
    if (node instanceof SVGSVGElement) {
      operations.push({ z, order, paint: paintVector(context, node, frame, root) });
    } else if (node instanceof HTMLImageElement) {
      operations.push({ z, order, paint: paintPicture(context, node, frame, root) });
    }
  }
  operations.sort((left, right) => left.z - right.z || left.order - right.order);
  context.save();
  roundedRect(context, frame.left, frame.top, CARD_WIDTH, root.height * scale, radius);
  context.clip();
  for (const operation of operations) {
    await operation.paint();
  }
  context.restore();

  const perforation = ticket.querySelector(".booking-ticket__perforation");
  if (perforation !== null) {
    const line = box(perforation, frame, root);
    const notch = NOTCH_RADIUS * scale;
    context.save();
    context.beginPath();
    context.arc(frame.left, line.y, notch, 0, Math.PI * 2);
    context.arc(frame.left + CARD_WIDTH, line.y, notch, 0, Math.PI * 2);
    context.clip();
    context.drawImage(backdrop, 0, 0);
    context.restore();
  }

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Image encoding failed."));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}

export async function shareBookingCard(
  booking: Booking,
  ticket: HTMLElement,
): Promise<ShareResult> {
  const canvas = await drawBookingCard(ticket);
  const blob = await canvasToBlob(canvas);
  const filename = `uroute-${booking.id}-card.png`;
  const file = new File([blob], filename, { type: "image/png" });

  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: booking.title });

      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return "downloaded";
}

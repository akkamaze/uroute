import type { Booking } from "./bookings-data";

type ShareResult = "shared" | "downloaded" | "cancelled";

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = value.split(" ");
  let line = "";
  let lineY = y;

  for (const word of words) {
    const next = line.length === 0 ? word : `${line} ${word}`;
    if (context.measureText(next).width > maxWidth && line.length > 0) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = next;
    }
  }
  context.fillText(line, x, lineY);
}

function drawBookingCard(booking: Booking): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Image canvas is unavailable.");
  }

  const background = "#eaf4ff";
  const primary =
    booking.id === "stay" ? "#f5f4f0" : booking.group === "tickets" ? "#eef5f1" : "#eff6ff";

  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1350);
  context.globalAlpha = 0.5;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(965, 215, 290, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(80, 1200, 310, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const x = 90;
  const y = 210;
  const width = 900;
  const height = 930;
  context.fillStyle = "#ffffff";
  roundedRect(context, x, y, width, height, 38);
  context.fill();
  context.fillStyle = primary;
  roundedRect(context, x + 30, y + 155, width - 60, 390, 30);
  context.fill();

  context.textBaseline = "alphabetic";
  context.fillStyle = "#183a57";
  context.font = "800 52px Arial, sans-serif";
  context.fillText("uroute.", 150, 318);
  context.fillStyle = "#607487";
  context.font = "700 21px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("TRAVEL BRINGS US CLOSER", 930, 310);
  context.textAlign = "left";

  context.fillStyle = "#607487";
  context.font = "700 21px Arial, sans-serif";
  context.fillText(
    booking.group === "tickets"
      ? "TICKETS & PASSES"
      : booking.id === "stay"
        ? "YOUR STAY IN KYOTO"
        : booking.id === "flight"
          ? "FLIGHT TO OSAKA"
          : "TRAIN TO THE AIRPORT",
    155,
    430,
  );

  if (booking.fromCode !== undefined && booking.toCode !== undefined) {
    context.fillStyle = "#17344b";
    context.font = "750 90px Arial, sans-serif";
    context.fillText(booking.fromCode, 155, 565);
    context.textAlign = "right";
    context.fillText(booking.toCode, 925, 565);
    context.textAlign = "left";
    context.strokeStyle = "#a8c8dc";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(485, 530);
    context.lineTo(595, 530);
    context.stroke();
    context.fillStyle = "#1677ff";
    context.font = "700 32px Arial, sans-serif";
    context.fillText(booking.id === "flight" ? "✈" : "→", 525, 544);
    context.fillStyle = "#4e6170";
    context.font = "28px Arial, sans-serif";
    context.fillText(booking.fromName ?? "", 155, 610);
    context.textAlign = "right";
    context.fillText(booking.toName ?? "", 925, 610);
    context.textAlign = "left";
    if (booking.fromLocalTime !== undefined && booking.toLocalTime !== undefined) {
      context.fillStyle = "#17344b";
      context.font = "700 48px Arial, sans-serif";
      context.fillText(booking.fromLocalTime, 155, 693);
      context.textAlign = "right";
      context.fillText(booking.toLocalTime, 925, 693);
      context.textAlign = "left";
      context.fillStyle = "#607487";
      context.font = "24px Arial, sans-serif";
      context.fillText("Local time", 155, 725);
      context.textAlign = "right";
      context.fillText("Local time", 925, 725);
      context.textAlign = "left";
    }
  } else {
    context.fillStyle = "#17344b";
    context.font = "700 50px Arial, sans-serif";
    drawWrappedText(context, booking.title, 155, 545, 760, 61);
    context.fillStyle = "#4e6170";
    context.font = "32px Arial, sans-serif";
    context.fillText(booking.timeLabel, 155, 680);
  }

  context.fillStyle = "#607487";
  context.font = "700 23px Arial, sans-serif";
  context.fillText("DATE", 150, 815);
  if (booking.fromCode === undefined) {
    context.fillText("DETAILS", 555, 815);
  }
  if (booking.id !== "flight") {
    context.fillText(booking.fromCode === undefined ? "TYPE" : "SERVICE", 555, 815);
  }

  context.fillStyle = "#21394d";
  context.font = "600 32px Arial, sans-serif";
  context.fillText(booking.dateLabel, 150, 858);
  if (booking.fromCode === undefined) {
    drawWrappedText(context, booking.detail, 555, 858, 350, 37);
  }
  if (booking.id === "flight") {
    context.fillStyle = "#eaf3ff";
    roundedRect(context, 555, 794, 65, 65, 14);
    context.fill();
    context.fillStyle = "#173e70";
    context.font = "700 28px Arial, sans-serif";
    context.fillText(booking.airlineCode ?? "✈", 568, 837);
    context.fillStyle = "#21394d";
    context.font = "600 28px Arial, sans-serif";
    context.fillText(booking.airlineName ?? booking.kind, 640, 821);
    context.fillStyle = "#607487";
    context.font = "24px Arial, sans-serif";
    context.fillText(booking.service ?? "", 640, 852);
  } else if (booking.fromCode !== undefined) {
    drawWrappedText(context, booking.service ?? booking.kind, 555, 858, 350, 37);
  } else {
    context.fillStyle = "#607487";
    context.font = "700 23px Arial, sans-serif";
    context.fillText("TYPE", 150, 928);
    context.fillStyle = "#21394d";
    context.font = "600 31px Arial, sans-serif";
    context.fillText(booking.service ?? booking.kind, 150, 970);
  }

  context.strokeStyle = "#c9d6df";
  context.lineWidth = 2;
  context.setLineDash([10, 10]);
  context.beginPath();
  context.moveTo(150, 995);
  context.lineTo(930, 995);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#607487";
  context.font = "600 24px Arial, sans-serif";
  context.fillText("Sample booking", 150, 1045);
  context.fillStyle = "#21394d";
  context.font = "600 30px Arial, sans-serif";
  context.fillText("Have a great trip!", 150, 1090);
  context.fillStyle = "#b6d0ef";
  context.font = "44px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("✈", 930, 1080);
  context.textAlign = "left";

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

export async function shareBookingCard(booking: Booking): Promise<ShareResult> {
  const canvas = drawBookingCard(booking);
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

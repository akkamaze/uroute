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

  const background = {
    flight: "#315d7c",
    stay: "#594e43",
    train: "#30545b",
    pass: "#465c64",
    ticket: "#465c64",
  }[booking.id];
  const primary =
    booking.id === "stay" ? "#f5f1eb" : booking.group === "tickets" ? "#edf3f0" : "#eef5fa";

  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1350);
  context.globalAlpha = 0.11;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(965, 215, 290, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(80, 1200, 360, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const x = 90;
  const y = 278;
  const width = 900;
  const height = 800;
  context.fillStyle = "#ffffff";
  roundedRect(context, x, y, width, height, 38);
  context.fill();
  context.save();
  roundedRect(context, x, y, width, height, 38);
  context.clip();
  context.fillStyle = primary;
  context.fillRect(x, y + 126, width, 285);
  context.restore();

  context.textBaseline = "alphabetic";
  context.fillStyle = "#183a57";
  context.font = "800 44px Arial, sans-serif";
  context.fillText("uroute.", 145, 360);
  context.fillStyle = "#607487";
  context.font = "600 26px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText(`${booking.kind} summary`, 930, 357);
  context.textAlign = "left";

  context.fillStyle = "#607487";
  context.font = "700 23px Arial, sans-serif";
  context.fillText(
    booking.group === "tickets"
      ? "TICKETS & PASSES"
      : booking.id === "stay"
        ? "YOUR STAY IN KYOTO"
        : booking.id === "flight"
          ? "FLIGHT TO OSAKA"
          : "TRAIN TO THE AIRPORT",
    145,
    470,
  );

  if (booking.fromCode !== undefined && booking.toCode !== undefined) {
    context.fillStyle = "#17344b";
    context.font = "750 100px Arial, sans-serif";
    context.fillText(booking.fromCode, 145, 586);
    context.textAlign = "right";
    context.fillText(booking.toCode, 935, 586);
    context.textAlign = "left";
    context.strokeStyle = "#a8c8dc";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(446, 551);
    context.lineTo(633, 551);
    context.stroke();
    context.fillStyle = "#1677ff";
    context.font = "700 40px Arial, sans-serif";
    context.fillText(booking.id === "flight" ? "✈" : "→", 530, 566);
    context.fillStyle = "#4e6170";
    context.font = "30px Arial, sans-serif";
    context.fillText(booking.fromName ?? "", 145, 632);
    context.textAlign = "right";
    context.fillText(booking.toName ?? "", 935, 632);
    context.textAlign = "left";
    if (booking.fromLocalTime !== undefined && booking.toLocalTime !== undefined) {
      context.fillStyle = "#17344b";
      context.font = "700 34px Arial, sans-serif";
      context.fillText(`${booking.fromLocalTime} local`, 145, 677);
      context.textAlign = "right";
      context.fillText(`${booking.toLocalTime} local`, 935, 677);
      context.textAlign = "left";
    }
  } else {
    context.fillStyle = "#17344b";
    context.font = "700 52px Arial, sans-serif";
    drawWrappedText(context, booking.title, 145, 550, 780, 61);
    context.fillStyle = "#4e6170";
    context.font = "32px Arial, sans-serif";
    context.fillText(booking.timeLabel, 145, 640);
  }

  context.fillStyle = "#607487";
  context.font = "700 23px Arial, sans-serif";
  context.fillText("DATE", 145, 750);
  if (booking.fromCode === undefined) {
    context.fillText("DETAILS", 555, 750);
  }
  context.fillText(
    booking.id === "flight" ? "FLIGHT" : booking.id === "train" ? "SERVICE" : "TYPE",
    booking.fromCode === undefined ? 145 : 555,
    booking.fromCode === undefined ? 865 : 750,
  );

  context.fillStyle = "#21394d";
  context.font = "600 31px Arial, sans-serif";
  context.fillText(booking.dateLabel, 145, 794);
  if (booking.fromCode === undefined) {
    drawWrappedText(context, booking.detail, 555, 794, 360, 37);
  }
  drawWrappedText(
    context,
    booking.service ?? booking.kind,
    booking.fromCode === undefined ? 145 : 555,
    booking.fromCode === undefined ? 909 : 794,
    booking.fromCode === undefined ? 760 : 360,
    37,
  );

  context.strokeStyle = "#c9d6df";
  context.lineWidth = 2;
  context.setLineDash([10, 10]);
  context.beginPath();
  context.moveTo(145, 960);
  context.lineTo(935, 960);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#607487";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("TRIP TO KYOTO", 145, 1010);
  context.fillStyle = "#21394d";
  context.font = "600 28px Arial, sans-serif";
  context.fillText("Keep every journey together.", 145, 1052);
  context.fillStyle = "#607487";
  context.font = "24px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("Sample booking", 935, 1035);
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

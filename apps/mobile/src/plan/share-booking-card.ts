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

  const primary =
    booking.id === "stay" ? "#f5f4f0" : booking.group === "tickets" ? "#eef5f1" : "#eff6ff";

  const sky = context.createLinearGradient(0, 0, 0, 1350);
  sky.addColorStop(0, "#eef7ff");
  sky.addColorStop(1, "#dcecff");
  context.fillStyle = sky;
  context.fillRect(0, 0, 1080, 1350);
  context.globalAlpha = 0.45;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.ellipse(900, 210, 280, 180, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(95, 450, 220, 150, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = "#c2ddf9";
  context.beginPath();
  context.moveTo(0, 1230);
  context.lineTo(145, 1170);
  context.lineTo(265, 1200);
  context.lineTo(405, 1130);
  context.lineTo(555, 1220);
  context.lineTo(710, 1115);
  context.lineTo(865, 1195);
  context.lineTo(965, 1160);
  context.lineTo(1080, 1210);
  context.lineTo(1080, 1350);
  context.lineTo(0, 1350);
  context.fill();

  const x = 90;
  const y = 210;
  const width = 900;
  const height = 930;
  const ticketFill = context.createLinearGradient(0, y, 0, y + height);
  ticketFill.addColorStop(0, "#ffffff");
  ticketFill.addColorStop(0.55, "#ffffff");
  ticketFill.addColorStop(1, "#f4f9ff");
  context.fillStyle = ticketFill;
  roundedRect(context, x, y, width, height, 38);
  context.fill();
  context.fillStyle = primary;
  roundedRect(context, x + 30, y + 155, width - 60, 390, 30);
  context.fill();

  context.save();
  roundedRect(context, x, y, width, height, 38);
  context.clip();
  context.fillStyle = "#e9f3ff";
  context.beginPath();
  context.moveTo(x, 1090);
  context.lineTo(x + 100, 1074);
  context.lineTo(x + 205, 1060);
  context.lineTo(x + 365, 1083);
  context.lineTo(x + 520, 1047);
  context.lineTo(x + 670, 1073);
  context.lineTo(x + 790, 1064);
  context.lineTo(x + width, 1082);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.fill();
  context.fillStyle = "#dcecff";
  context.beginPath();
  context.moveTo(x, 1120);
  context.lineTo(x + 145, 1095);
  context.lineTo(x + 280, 1110);
  context.lineTo(x + 450, 1077);
  context.lineTo(x + 590, 1092);
  context.lineTo(x + 750, 1081);
  context.lineTo(x + width, 1100);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.fill();
  context.restore();

  context.textBaseline = "alphabetic";
  context.font = "800 52px Arial, sans-serif";
  context.fillStyle = "#1666ff";
  context.fillText("u", 150, 318);
  const initialWidth = context.measureText("u").width;
  context.fillStyle = "#183a57";
  context.fillText("route", 150 + initialWidth, 318);
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
  if (booking.fromCode !== undefined && booking.id !== "flight") {
    context.fillText("SERVICE", 555, 815);
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

  context.fillStyle = "#dcecff";
  context.beginPath();
  context.arc(x, 995, 27, 0, Math.PI * 2);
  context.arc(x + width, 995, 27, 0, Math.PI * 2);
  context.fill();

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

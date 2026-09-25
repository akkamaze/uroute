import { useRef, useState } from "react";

const REVEAL_PX = 64;
const REVEAL_THRESHOLD_PX = 32;

interface StopGesture {
  direction: "pending" | "swipe" | "vertical";
  id: string;
  initialOffset: number;
  pointerId: number;
  startX: number;
  startY: number;
}

export function usePlanStopSwipe(): {
  openId: string | null;
  offset: number;
  start: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  move: (event: React.PointerEvent<HTMLDivElement>) => void;
  end: (event: React.PointerEvent<HTMLDivElement>) => void;
  clear: () => void;
  close: () => void;
  clickSuppressed: () => boolean;
} {
  const [openId, setOpenId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const gestureRef = useRef<StopGesture | null>(null);
  const suppressClickRef = useRef(false);

  function clear(): void {
    gestureRef.current = null;
  }

  function close(): void {
    clear();
    setOpenId(null);
    setOffset(0);
  }

  function suppressClick(): void {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 300);
  }

  function start(event: React.PointerEvent<HTMLDivElement>, id: string): void {
    if (event.button !== 0) {
      return;
    }
    if (gestureRef.current !== null && gestureRef.current.pointerId !== event.pointerId) {
      close();

      return;
    }
    gestureRef.current = {
      direction: "pending",
      id,
      initialOffset: openId === id ? -REVEAL_PX : 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function move(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.direction === "pending") {
      if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        gesture.direction = "swipe";
        event.currentTarget.setPointerCapture(event.pointerId);
        setOpenId(gesture.id);
      } else if (Math.abs(dy) >= 10 && Math.abs(dy) >= Math.abs(dx) / 1.25) {
        gesture.direction = "vertical";
      }
    }
    if (gesture.direction === "swipe") {
      setOffset(Math.max(-REVEAL_PX, Math.min(0, gesture.initialOffset + dx)));
    }
  }

  function end(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const wasSwipe = gesture.direction === "swipe";
    const finalOffset = Math.max(
      -REVEAL_PX,
      Math.min(0, gesture.initialOffset + event.clientX - gesture.startX),
    );
    clear();
    if (!wasSwipe) {
      return;
    }
    suppressClick();
    if (finalOffset <= -REVEAL_THRESHOLD_PX) {
      setOpenId(gesture.id);
      setOffset(-REVEAL_PX);
    } else {
      close();
    }
  }

  return {
    openId,
    offset,
    start,
    move,
    end,
    clear,
    close,
    clickSuppressed: () => suppressClickRef.current,
  };
}

import { cn } from "cn";
import { useEffect, useRef } from "react";

import { onThemeChange, resolveInk } from "../ink";
import { restingMotion, stepMotion } from "../motion";
import type { MarkPaint, Motion } from "../types";

type Props = {
  paint: MarkPaint;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function MarkCanvas({
  paint,
  working = false,
  speed = 1,
  decorative = false,
  className,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useRef<Motion>(restingMotion());

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");

    if (!element || !context) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = 0;
    let ink = resolveInk(element);
    const draw = () =>
      paint(context, { size, ink, color: motion.current.color, turn: motion.current.turn });
    let animating = false;
    const redraw = () => {
      if (!animating) draw();
    };
    const measure = () => {
      size = Math.max(Math.round(element.clientWidth * devicePixelRatio), 1);
      element.width = element.height = size;
      redraw();
    };
    const sized = new ResizeObserver(measure);
    sized.observe(element);
    const unthemed = onThemeChange(() => {
      ink = resolveInk(element);
      redraw();
    });
    const stop = () => {
      sized.disconnect();
      unthemed();
    };
    measure();

    if (still) {
      motion.current = { ...restingMotion(), color: working ? 1 : 0 };
      draw();
      return stop;
    }

    if (!working && motion.current.mode === "rest") {
      draw();
      return stop;
    }

    animating = true;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.1);
      last = now;
      motion.current = stepMotion(motion.current, step * speed, working);
      draw();

      if (working || motion.current.mode !== "rest") frame = requestAnimationFrame(tick);
      else animating = false;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [paint, working, speed]);

  return (
    <canvas
      ref={canvas}
      role={working && !decorative ? "img" : undefined}
      aria-label={working && !decorative ? "Working" : undefined}
      aria-hidden={working && !decorative ? undefined : true}
      className={cn("size-5 shrink-0 text-muted-foreground", className)}
    />
  );
}

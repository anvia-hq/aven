const MIN_PIXELS = 8;

export function drawFallback(canvas: HTMLCanvasElement, color: string) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.max(MIN_PIXELS, Math.round(canvas.clientWidth * ratio));
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) return;

  const middle = size / 2;
  const body = context.createRadialGradient(middle, middle * 0.7, 0, middle, middle, middle);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.25, color);
  body.addColorStop(1, color);
  context.fillStyle = body;
  context.beginPath();
  context.arc(middle, middle, middle * 0.78, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";

  for (const side of [-1, 1]) {
    context.beginPath();
    context.ellipse(
      middle + side * size * 0.15,
      middle,
      size * 0.08,
      size * 0.11,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

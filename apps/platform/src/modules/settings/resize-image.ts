export const AVATAR_SIZE = 256;

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function squareAvatar(file: File, size = AVATAR_SIZE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser cannot resize images");

  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const webp = await encode(canvas, "image/webp", 0.9);

  if (webp?.type === "image/webp") return webp;

  const jpeg = await encode(canvas, "image/jpeg", 0.9);

  if (!jpeg) throw new Error("This browser cannot save the image");

  return jpeg;
}

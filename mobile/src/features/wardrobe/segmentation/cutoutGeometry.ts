/**
 * Pure bounding-box / square-crop math used by `extractGarmentCutout.ts`.
 * Kept free of Skia/RN imports (same rationale as `u2netMath.ts`) so it can
 * be exercised directly with plain `node`.
 */

export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
export type SquareCrop = { x: number; y: number; side: number };

/**
 * Scans a single-channel `width x height` alpha/luminance buffer and
 * returns the tightest box containing every pixel strictly above
 * `threshold`. Returns `null` if no pixel clears the threshold (e.g. the
 * model produced an all-background mask) — callers should treat that as
 * "couldn't find a garment" rather than crop to a degenerate box.
 */
export function findForegroundBoundingBox(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold: number
): BoundingBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[rowOffset + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Grows `box` by `paddingRatio` (relative to its larger side, so the pad is
 * uniform on all four edges) and clamps the result to the image bounds.
 */
export function padAndClampBoundingBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  paddingRatio: number
): BoundingBox {
  const boxWidth = box.maxX - box.minX + 1;
  const boxHeight = box.maxY - box.minY + 1;
  const padding = Math.round(Math.max(boxWidth, boxHeight) * paddingRatio);

  return {
    minX: Math.max(0, box.minX - padding),
    minY: Math.max(0, box.minY - padding),
    maxX: Math.min(imageWidth - 1, box.maxX + padding),
    maxY: Math.min(imageHeight - 1, box.maxY + padding),
  };
}

/**
 * Derives a square crop (top-left `x`/`y` + `side`, in the same pixel space
 * as `box`) that's centered on `box` and fully contained within
 * `imageWidth x imageHeight` — shifting (never shrinking below fitting the
 * larger box dimension, only re-centering) when a box near an edge would
 * otherwise push the square out of bounds.
 */
export function squareCropFromBoundingBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number
): SquareCrop {
  const boxWidth = box.maxX - box.minX + 1;
  const boxHeight = box.maxY - box.minY + 1;
  const side = Math.min(imageWidth, imageHeight, Math.max(boxWidth, boxHeight));

  const centerX = (box.minX + box.maxX + 1) / 2;
  const centerY = (box.minY + box.maxY + 1) / 2;

  const x = Math.min(Math.max(centerX - side / 2, 0), imageWidth - side);
  const y = Math.min(Math.max(centerY - side / 2, 0), imageHeight - side);

  return { x, y, side };
}

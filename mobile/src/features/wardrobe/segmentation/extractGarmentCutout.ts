import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { findForegroundBoundingBox, padAndClampBoundingBox, squareCropFromBoundingBox } from './cutoutGeometry';
import { loadSkia } from './loadSkia';

const OUTPUT_SIZE = 768;
// A mask value has to clear this (out of 255) to count as "foreground" when
// computing the crop bounding box. Low on purpose — this only decides the
// crop rectangle, not the final alpha (which uses the mask's full
// gradient), so it's fine to be generous about what counts as "some
// garment here".
const FOREGROUND_THRESHOLD = 12;
// Padding around the detected garment, relative to its larger dimension,
// so the crop doesn't hug the edges too tightly.
const BBOX_PADDING_RATIO = 0.04;
// Light blur (in OUTPUT_SIZE pixels) on the mask before it's applied as
// alpha — softens the model's jagged/staircase edges without attempting
// real morphological erode/dilate.
const MASK_FEATHER_SIGMA = 3;

/**
 * Combines a garment photo with the (already original-resolution) mask
 * `tfliteSegmentationEngine.ts` produced into the final transparent-
 * background cutout: mask-as-alpha (lightly feathered), cropped to the
 * bounding box of non-transparent pixels, padded to a square.
 *
 * Reuses `compositeToTexture.ts`'s general Skia techniques (offscreen
 * surface, `BlendMode.DstIn` to punch alpha, per-platform PNG output) but
 * adapted: that file's mask is a hand-drawn radial gradient (a perfect
 * circle, cheap to feather analytically); this one comes from an ML model
 * and has an arbitrary shape, so the mask is a real raster image and its
 * edges are softened with an actual Gaussian blur instead.
 *
 * Throws if the mask has no foreground pixels above `FOREGROUND_THRESHOLD`
 * (nothing to crop to) or if any Skia step fails — callers should treat
 * that as "segmentation didn't produce a usable cutout" and fall back to
 * the raw photo, same as `SegmentationEngine.segment()` returning `null`.
 */
export async function extractGarmentCutout(photoUri: string, maskUri: string): Promise<string> {
  const { Skia, BlendMode, ImageFormat, ColorType, AlphaType, TileMode } = await loadSkia();

  const [photoData, maskData] = await Promise.all([Skia.Data.fromURI(photoUri), Skia.Data.fromURI(maskUri)]);
  const photoImage = Skia.Image.MakeImageFromEncoded(photoData);
  const maskImage = Skia.Image.MakeImageFromEncoded(maskData);
  if (!photoImage || !maskImage) {
    throw new Error('extractGarmentCutout: could not decode the photo or mask image.');
  }

  const width = photoImage.width();
  const height = photoImage.height();

  // `SegmentationEngine.segment()`'s contract says the mask is already
  // resized to the photo's own dimensions, but don't rely on that holding
  // exactly for every possible engine implementation — stretch it onto a
  // `width x height` surface first so the rest of this function can assume
  // pixel-for-pixel alignment with `photoImage` regardless.
  const maskResizeSurface = Skia.Surface.Make(width, height);
  if (!maskResizeSurface) {
    throw new Error('extractGarmentCutout: could not allocate a surface to resize the mask.');
  }
  const maskResizeCanvas = maskResizeSurface.getCanvas();
  const maskResizePaint = Skia.Paint();
  maskResizePaint.setAntiAlias(true);
  maskResizeCanvas.drawImageRect(
    maskImage,
    Skia.XYWHRect(0, 0, maskImage.width(), maskImage.height()),
    Skia.XYWHRect(0, 0, width, height),
    maskResizePaint
  );
  maskResizeSurface.flush();
  const resizedMaskImage = maskResizeSurface.makeImageSnapshot();

  // Read the mask back as plain 8-bit grayscale regardless of how it was
  // actually encoded/decoded, then build a fresh Alpha_8 image from those
  // same bytes — an Alpha_8 image is what `BlendMode.DstIn` needs to punch
  // holes in the destination's alpha channel below (a plain grayscale
  // image has no alpha channel of its own, opaque everywhere, so DstIn
  // against it would be a no-op).
  const grayBytes = resizedMaskImage.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.Gray_8,
    alphaType: AlphaType.Opaque,
  }) as Uint8Array | null;
  if (!grayBytes) {
    throw new Error('extractGarmentCutout: could not read mask pixel data.');
  }

  const boundingBox = findForegroundBoundingBox(grayBytes, width, height, FOREGROUND_THRESHOLD);
  if (!boundingBox) {
    throw new Error('extractGarmentCutout: mask has no foreground pixels — nothing to crop to.');
  }
  const paddedBox = padAndClampBoundingBox(boundingBox, width, height, BBOX_PADDING_RATIO);
  const crop = squareCropFromBoundingBox(paddedBox, width, height);

  const alphaMaskImage = Skia.Image.MakeImage(
    { width, height, colorType: ColorType.Alpha_8, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(grayBytes),
    width
  );
  if (!alphaMaskImage) {
    throw new Error('extractGarmentCutout: could not build the alpha mask image.');
  }

  const surface = Skia.Surface.Make(OUTPUT_SIZE, OUTPUT_SIZE);
  if (!surface) {
    throw new Error('extractGarmentCutout: could not allocate an offscreen surface.');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('rgba(0,0,0,0)'));

  const cropSrcRect = Skia.XYWHRect(crop.x, crop.y, crop.side, crop.side);
  const fullDstRect = Skia.XYWHRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  // 1. Draw the cropped square region of the original photo, scaled to
  // fill the output canvas.
  const photoPaint = Skia.Paint();
  photoPaint.setAntiAlias(true);
  canvas.drawImageRect(photoImage, cropSrcRect, fullDstRect, photoPaint);

  // 2. Punch alpha using the same crop region of the mask — feathered with
  // a light blur so the ML model's raw edge doesn't look jagged.
  const maskPaint = Skia.Paint();
  maskPaint.setAntiAlias(true);
  maskPaint.setBlendMode(BlendMode.DstIn);
  maskPaint.setImageFilter(Skia.ImageFilter.MakeBlur(MASK_FEATHER_SIGMA, MASK_FEATHER_SIGMA, TileMode.Decal, null));
  canvas.drawImageRect(alphaMaskImage, cropSrcRect, fullDstRect, maskPaint);

  surface.flush();
  const outputImage = surface.makeImageSnapshot();

  if (Platform.OS === 'web') {
    const base64 = outputImage.encodeToBase64(ImageFormat.PNG, 100);
    return `data:image/png;base64,${base64}`;
  }

  const bytes = outputImage.encodeToBytes(ImageFormat.PNG, 100);
  const file = new File(Paths.cache, `garment-cutout-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

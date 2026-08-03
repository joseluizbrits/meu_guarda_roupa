import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { loadSkia } from './loadSkia';
import type { SegmentationEngine, SegmentationResult } from './segmentationEngine';
import { dequantizeOutputAlpha, quantizeInputChannel, U2NET_INPUT_SIZE, OUTPUT_TENSOR_NAME } from './u2netMath';

// `import type` is erased entirely at compile time — unlike a value import,
// this has zero runtime footprint, so it's safe even though `@shopify/
// react-native-skia`'s actual (value) exports are only ever loaded lazily
// via `loadSkia()` below (see that file's doc comment for why).
type SkiaModule = Awaited<ReturnType<typeof loadSkia>>;

/**
 * On-device background removal via `assets/models/u2net_full_integer_quant.tflite`
 * (a quantized U2Net, ~44MB, bundled with the app — see `u2netMath.ts` for
 * where every quantization constant below comes from).
 *
 * `react-native-fast-tflite` is native-only — its JS entry calls
 * `TurboModuleRegistry.getEnforcing('Tflite')` at *module-evaluation time*,
 * which throws immediately on web (there is no such native module there).
 * That's a permanent, expected constraint, not a TODO: `expo start --web`
 * cannot run on-device TFLite inference, full stop. So this file:
 *   1. Checks `Platform.OS === 'web'` FIRST and returns `null` before doing
 *      anything else.
 *   2. Only ever `import()`s `react-native-fast-tflite` dynamically, inside
 *      the native code path below — never as a static top-level import —
 *      so evaluating this module on web (which happens routinely, since
 *      `app/wardrobe/tag.tsx` imports it unconditionally) never touches the
 *      native-only package at all.
 */
export const tfliteSegmentationEngine: SegmentationEngine = {
  segment: segmentWithU2Net,
};

// Loading the 44MB model is expensive; reuse one instance across every
// `segment()` call in the app's lifetime instead of reloading it per photo.
let modelPromise: Promise<TensorflowModel> | null = null;

async function getModel(): Promise<TensorflowModel> {
  if (!modelPromise) {
    modelPromise = loadModel().catch((error) => {
      // Don't cache a rejected promise — a transient failure (e.g. an
      // asset-download hiccup) shouldn't permanently disable segmentation
      // for the rest of the session.
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

async function loadModel(): Promise<TensorflowModel> {
  const { loadTensorflowModel } = await import('react-native-fast-tflite');
  // Same `Asset.fromModule(require(...))` + `downloadAsync()` pattern
  // `Avatar3DView.tsx` uses for `BaseHuman.glb` — `.localUri` is the
  // on-device cache path after download, `.uri` covers the (already-local)
  // web case, though this function never actually runs on web (see above).
  const asset = Asset.fromModule(require('@/assets/models/u2net_full_integer_quant.tflite'));
  await asset.downloadAsync();
  const modelUrl = asset.localUri ?? asset.uri;
  return loadTensorflowModel({ url: modelUrl });
}

async function segmentWithU2Net(imageUri: string): Promise<SegmentationResult | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const skia = await loadSkia();
    const { Skia } = skia;

    const sourceData = await Skia.Data.fromURI(imageUri);
    const sourceImage = Skia.Image.MakeImageFromEncoded(sourceData);
    if (!sourceImage) {
      return null;
    }
    const sourceWidth = sourceImage.width();
    const sourceHeight = sourceImage.height();

    const inputTensor = buildInputTensor(sourceImage, skia);
    if (!inputTensor) {
      return null;
    }

    const model = await getModel();
    const outputIndex = model.outputs.findIndex((tensor) => tensor.name === OUTPUT_TENSOR_NAME);
    if (outputIndex === -1) {
      // Every output tensor shares the same shape/quantization (see
      // `u2netMath.ts`), but only `Identity` is the real fused mask — the
      // other 6 are training-only side outputs. If the runtime doesn't
      // expose tensor names for some reason, there's no safe way to guess
      // which index is which, so bail rather than risk compositing one of
      // the auxiliary (lower quality) outputs.
      throw new Error(
        `tfliteSegmentationEngine: could not find the "${OUTPUT_TENSOR_NAME}" output tensor among: ${model.outputs
          .map((t) => t.name)
          .join(', ')}`
      );
    }

    const outputs = await model.run([inputTensor]);
    // `outputIndex` (found above via `model.outputs`) is safe to reuse here:
    // traced react-native-fast-tflite's native source
    // (node_modules/react-native-fast-tflite/cpp/TensorflowPlugin.cpp) —
    // the `outputs` getter and `run()`'s `copyOutputBuffers` both iterate
    // `TfLiteInterpreterGetOutputTensor(interpreter, i)` for the same `i`,
    // so `model.outputs[i]` and `run()`'s result`[i]` are guaranteed to be
    // the same tensor on both iOS and Android (shared cross-platform C++,
    // not per-platform code that could disagree). No device test needed for
    // this specific concern.
    const rawMask = outputs[outputIndex] as Int8Array;

    const maskBytes = new Uint8Array(U2NET_INPUT_SIZE * U2NET_INPUT_SIZE);
    for (let i = 0; i < maskBytes.length; i++) {
      maskBytes[i] = Math.round(dequantizeOutputAlpha(rawMask[i]) * 255);
    }

    const maskUri = await upscaleMaskToUri(maskBytes, sourceWidth, sourceHeight, skia);
    if (!maskUri) {
      return null;
    }

    return { maskUri, width: sourceWidth, height: sourceHeight };
  } catch (error) {
    // Segmentation is a best-effort enhancement — any failure (model load,
    // decode, inference) falls back to the raw photo, same as a `null`
    // return. See `segmentationEngine.ts`'s doc comment. Logged (not
    // swallowed silently) so a real failure on-device is diagnosable from
    // Metro/adb logs instead of just "background wasn't removed, unclear
    // why".
    console.warn('[tfliteSegmentationEngine] segmentation failed, falling back to raw photo:', error);
    return null;
  }
}

/**
 * Resizes (stretches, no letterboxing — matches how the reference U2Net
 * inference preprocesses images) the source photo down to the model's
 * 320x320 input, reads its raw RGBA bytes, and quantizes each pixel's R/G/B
 * channels into the int8 tensor the model expects.
 */
function buildInputTensor(sourceImage: SkImage, skia: SkiaModule): Int8Array | null {
  const { Skia, ColorType, AlphaType } = skia;

  const surface = Skia.Surface.Make(U2NET_INPUT_SIZE, U2NET_INPUT_SIZE);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('rgba(0,0,0,0)'));

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    sourceImage,
    Skia.XYWHRect(0, 0, sourceImage.width(), sourceImage.height()),
    Skia.XYWHRect(0, 0, U2NET_INPUT_SIZE, U2NET_INPUT_SIZE),
    paint
  );
  surface.flush();

  const resized = surface.makeImageSnapshot();
  const rgba = resized.readPixels(0, 0, {
    width: U2NET_INPUT_SIZE,
    height: U2NET_INPUT_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  }) as Uint8Array | null;
  if (!rgba) {
    return null;
  }

  const input = new Int8Array(U2NET_INPUT_SIZE * U2NET_INPUT_SIZE * 3);
  const pixelCount = U2NET_INPUT_SIZE * U2NET_INPUT_SIZE;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const rgbaOffset = pixel * 4;
    const inputOffset = pixel * 3;
    input[inputOffset] = quantizeInputChannel(rgba[rgbaOffset] / 255, 0);
    input[inputOffset + 1] = quantizeInputChannel(rgba[rgbaOffset + 1] / 255, 1);
    input[inputOffset + 2] = quantizeInputChannel(rgba[rgbaOffset + 2] / 255, 2);
  }
  return input;
}

/**
 * Builds a 320x320 grayscale mask image from the dequantized model output,
 * resizes it up to the ORIGINAL photo's dimensions (again a direct
 * stretch, matching the non-letterboxed downscale used going in), and
 * writes it to a cache-directory PNG file. Native-only, same as the rest of
 * this module — there's no web branch here because `segmentWithU2Net`
 * already returned before reaching this point on web.
 */
async function upscaleMaskToUri(
  maskBytes: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  skia: SkiaModule
): Promise<string | null> {
  const { Skia, ColorType, AlphaType, ImageFormat } = skia;

  const maskData = Skia.Data.fromBytes(maskBytes);
  const maskImage = Skia.Image.MakeImage(
    { width: U2NET_INPUT_SIZE, height: U2NET_INPUT_SIZE, colorType: ColorType.Gray_8, alphaType: AlphaType.Opaque },
    maskData,
    U2NET_INPUT_SIZE
  );
  if (!maskImage) {
    return null;
  }

  const surface = Skia.Surface.Make(targetWidth, targetHeight);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    maskImage,
    Skia.XYWHRect(0, 0, U2NET_INPUT_SIZE, U2NET_INPUT_SIZE),
    Skia.XYWHRect(0, 0, targetWidth, targetHeight),
    paint
  );
  surface.flush();

  const outputImage = surface.makeImageSnapshot();
  const bytes = outputImage.encodeToBytes(ImageFormat.PNG, 100);
  const file = new File(Paths.cache, `garment-mask-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

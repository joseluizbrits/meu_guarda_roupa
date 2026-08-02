import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const OUTPUT_SIZE = 512;
// Fraction of the output radius over which the mask fades from opaque to
// transparent (0 = hard edge, 1 = fades from the very center).
const FEATHER_RATIO = 0.18;

function isResolvableUri(value: string): boolean {
  return /^(file|http|https|data|content|blob|ph|asset):/i.test(value);
}

/**
 * Some sources (e.g. `expo-camera`'s `takePictureAsync` on web) return the
 * raw base64 payload as `uri` with no `data:` prefix. Skia's `Data.fromURI`
 * always resolves via `fetch()`/native URI loading, so wrap bare base64 into
 * a proper data URI before handing it off.
 */
function normalizeSourceUri(sourceUri: string): string {
  if (isResolvableUri(sourceUri)) {
    return sourceUri;
  }
  return `data:image/jpeg;base64,${sourceUri}`;
}

/**
 * Lazily (dynamically) imports `@shopify/react-native-skia`. This must NOT
 * be a static top-level import: on web, the package's `Skia` object is
 * built exactly once, at module-evaluation time, from `global.CanvasKit`
 * (see `Skia.web.js`: `export const Skia = JsiSkApi(global.CanvasKit)`). If
 * this module were imported statically, Metro would evaluate it as soon as
 * this file is pulled into the bundle (e.g. because a route file imports
 * `compositeToTexture`) — almost certainly before `LoadSkiaWeb()` below has
 * had a chance to populate `global.CanvasKit`, permanently baking in a
 * `Skia` instance with undefined factories (`Skia.Image` etc.). Deferring
 * the import to inside this async function guarantees it only evaluates
 * after CanvasKit is loaded.
 */
async function loadSkia() {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb();
  }
  return import('@shopify/react-native-skia');
}

/**
 * Crops the captured face photo to a centered square, feathers a soft
 * circular alpha mask over it (transparent outside the circle), and encodes
 * the result as a 512x512 PNG usable as a `THREE.Texture` source.
 *
 * Returns a URI for the composited PNG:
 * - Native (iOS/Android): a `file://` URI written via `expo-file-system`
 *   into the cache directory.
 * - Web: a `data:image/png;base64,...` URI. `expo-file-system`'s File API
 *   (the new SDK 57 API used here) has no web implementation — its
 *   `FileSystemFile`/`FileSystemDirectory` classes are empty stubs on web —
 *   so writing to "a local file" isn't possible there. A data URI is the
 *   web-equivalent local representation: it works directly as an `<Image>`
 *   source and can be uploaded as bytes without any extra read step.
 */
export async function compositeToTexture(sourceUri: string): Promise<string> {
  const { Skia, BlendMode, ImageFormat, TileMode } = await loadSkia();

  const uri = normalizeSourceUri(sourceUri);
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('compositeToTexture: could not decode the source image.');
  }

  const sourceWidth = image.width();
  const sourceHeight = image.height();
  const side = Math.min(sourceWidth, sourceHeight);
  const cropX = (sourceWidth - side) / 2;
  const cropY = (sourceHeight - side) / 2;

  const surface = Skia.Surface.Make(OUTPUT_SIZE, OUTPUT_SIZE);
  if (!surface) {
    throw new Error('compositeToTexture: could not allocate an offscreen surface.');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('rgba(0,0,0,0)'));

  // 1. Draw the centered square crop, scaled to fill the output canvas.
  const imagePaint = Skia.Paint();
  imagePaint.setAntiAlias(true);
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(cropX, cropY, side, side),
    Skia.XYWHRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE),
    imagePaint
  );

  // 2. Feather the edges: multiply existing alpha (DstIn) by a radial
  // gradient that's fully opaque in the center and fades to fully
  // transparent at the circle's edge.
  const outerRadius = OUTPUT_SIZE / 2;
  const featherStart = outerRadius * (1 - FEATHER_RATIO);
  const gradient = Skia.Shader.MakeRadialGradient(
    Skia.Point(outerRadius, outerRadius),
    outerRadius,
    [Skia.Color('rgba(255,255,255,1)'), Skia.Color('rgba(255,255,255,1)'), Skia.Color('rgba(255,255,255,0)')],
    [0, featherStart / outerRadius, 1],
    TileMode.Clamp
  );
  const maskPaint = Skia.Paint();
  maskPaint.setShader(gradient);
  maskPaint.setBlendMode(BlendMode.DstIn);
  maskPaint.setAntiAlias(true);
  canvas.drawRect(Skia.XYWHRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE), maskPaint);

  surface.flush();
  const outputImage = surface.makeImageSnapshot();

  if (Platform.OS === 'web') {
    const base64 = outputImage.encodeToBase64(ImageFormat.PNG, 100);
    return `data:image/png;base64,${base64}`;
  }

  const bytes = outputImage.encodeToBytes(ImageFormat.PNG, 100);
  const file = new File(Paths.cache, `face-texture-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

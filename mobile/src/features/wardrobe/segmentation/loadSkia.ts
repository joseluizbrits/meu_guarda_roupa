import { Platform } from 'react-native';

/**
 * Lazily (dynamically) imports `@shopify/react-native-skia`. Same rationale
 * as `src/features/avatar/faceTexture/compositeToTexture.ts`'s identical
 * helper: on web, `Skia` is built once at module-evaluation time from
 * `global.CanvasKit`, so a static top-level import risks evaluating before
 * `LoadSkiaWeb()` has populated it. Deferring the import here guarantees it
 * only evaluates after CanvasKit is loaded.
 */
export async function loadSkia() {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb({ locateFile: (file) => `/${file}` });
  }
  return import('@shopify/react-native-skia');
}

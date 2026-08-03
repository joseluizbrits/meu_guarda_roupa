/**
 * Result of a successful segmentation: a URI for a single-channel mask
 * image (alpha/luminance, background = 0/black, foreground = 255/white),
 * already resized to the ORIGINAL photo's `width`/`height` — the caller
 * (`extractGarmentCutout.ts`) shouldn't need to know anything about the
 * model's own internal input resolution.
 */
export type SegmentationResult = {
  maskUri: string;
  width: number;
  height: number;
};

/**
 * Pluggable on-device background-removal engine. Deliberately narrow (one
 * method, a URI in, a mask URI out) so a different model/library can be
 * dropped in later (e.g. a smaller/faster one, or a remote fallback)
 * without touching `extractGarmentCutout.ts` or the capture flow that
 * calls it.
 *
 * `null` means "couldn't segment" — no foreground detected, an unsupported
 * platform (see `tfliteSegmentationEngine.ts`'s web branch), or any other
 * failure. Callers should treat that as "fall back to the raw photo",
 * never as an error that blocks saving the item.
 */
export interface SegmentationEngine {
  segment(imageUri: string): Promise<SegmentationResult | null>;
}

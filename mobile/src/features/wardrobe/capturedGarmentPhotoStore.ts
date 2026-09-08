import { create } from 'zustand';
import { WardrobeCategory, type DetectedPiece } from '@/src/core/api/wardrobe';

type CapturedGarmentPhotoState = {
  uri: string | null;
  width: number | null;
  height: number | null;
  contentType: string | null;
  detections: DetectedPiece[] | null;
  photoAssetId: string | null;
  sourceCategoryHint: string | null;
  setPhoto: (uri: string, width: number, height: number, contentType: string) => void;
  setDetections: (detections: DetectedPiece[], photoAssetId: string, sourceCategoryHint?: string | null) => void;
  clear: () => void;
};

/**
 * Transient (non-persisted) holder for the raw garment photo captured in
 * `app/wardrobe/capture.tsx`, read by `app/wardrobe/tag.tsx`. Same rationale
 * as `src/features/onboarding/capturedPhotoStore.ts`: a route param would
 * work for small payloads, but on web `takePictureAsync` returns the image
 * as a base64 data URI (no local file system) — far too large to round-trip
 * through a URL query string.
 * 
 * Extended to also hold multi-garment detection results for the select-pieces flow.
 */
export const useCapturedGarmentPhotoStore = create<CapturedGarmentPhotoState>((set) => ({
  uri: null,
  width: null,
  height: null,
  contentType: null,
  detections: null,
  photoAssetId: null,
  sourceCategoryHint: null,
  setPhoto: (uri, width, height, contentType) => set({ uri, width, height, contentType }),
  setDetections: (detections, photoAssetId, sourceCategoryHint = null) => set({ detections, photoAssetId, sourceCategoryHint }),
  clear: () => set({ uri: null, width: null, height: null, contentType: null, detections: null, photoAssetId: null, sourceCategoryHint: null }),
}));

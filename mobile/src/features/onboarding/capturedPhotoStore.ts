import { create } from 'zustand';

type CapturedPhotoState = {
  uri: string | null;
  width: number | null;
  height: number | null;
  setPhoto: (uri: string, width: number, height: number) => void;
  clear: () => void;
};

/**
 * Transient (non-persisted) holder for the raw face photo captured in
 * `app/onboarding/face-capture.tsx`, read by `app/onboarding/review.tsx`.
 * A plain route param would work for small payloads, but on web
 * `takePictureAsync` returns the image as a base64 data URI (no local file
 * system) — far too large to round-trip through a URL query string.
 */
export const useCapturedPhotoStore = create<CapturedPhotoState>((set) => ({
  uri: null,
  width: null,
  height: null,
  setPhoto: (uri, width, height) => set({ uri, width, height }),
  clear: () => set({ uri: null, width: null, height: null }),
}));

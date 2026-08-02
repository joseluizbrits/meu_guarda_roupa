import { api, ApiError } from '@/src/core/api/client';

export type Measurements = {
  height_cm: number;
  chest_cm: number;
  waist_cm: number;
  hip_cm: number;
  shoulder_cm: number;
  inseam_cm: number;
};

export type MeasurementsResponse = Measurements & {
  updated_at: string;
};

/**
 * Fetches the current user's stored measurements. Returns `null` (rather than
 * throwing) when the user has never set them (backend responds 404) — callers
 * use that to distinguish "not onboarded yet" from a real failure.
 */
export async function getMeasurements(): Promise<MeasurementsResponse | null> {
  try {
    return await api.get<MeasurementsResponse>('/api/v1/users/me/measurements');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/** Upsert — safe to call repeatedly with the same payload. */
export async function putMeasurements(measurements: Measurements): Promise<MeasurementsResponse> {
  return api.put<MeasurementsResponse>('/api/v1/users/me/measurements', measurements);
}

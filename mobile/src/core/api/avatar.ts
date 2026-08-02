import { api, ApiError } from '@/src/core/api/client';

export type AvatarPayload = {
  base_mesh_id: string;
  morph_params: Record<string, unknown>;
  face_texture_asset_id: string | null;
};

export type AvatarResponse = AvatarPayload & {
  id: string;
  updated_at: string;
  face_texture_url: string | null;
};

/**
 * Fetches the current user's stored avatar. Returns `null` (rather than
 * throwing) when it hasn't been created yet (backend responds 404).
 */
export async function getAvatar(): Promise<AvatarResponse | null> {
  try {
    return await api.get<AvatarResponse>('/api/v1/users/me/avatar');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/** Upsert — safe to call repeatedly. */
export async function putAvatar(payload: AvatarPayload): Promise<AvatarResponse> {
  return api.put<AvatarResponse>('/api/v1/users/me/avatar', payload);
}

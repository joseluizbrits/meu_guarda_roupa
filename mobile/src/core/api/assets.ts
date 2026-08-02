import { api } from '@/src/core/api/client';

export type AssetKind = 'face_texture';

export type UploadUrlResponse = {
  asset_id: string;
  upload_url: string;
  expires_in: number;
};

export type AssetResponse = {
  id: string;
  kind: AssetKind;
  content_type: string;
  download_url: string;
};

export async function requestUploadUrl(kind: AssetKind, contentType: string): Promise<UploadUrlResponse> {
  return api.post<UploadUrlResponse>('/api/v1/assets/upload-url', { kind, content_type: contentType });
}

export async function getAsset(assetId: string): Promise<AssetResponse> {
  return api.get<AssetResponse>(`/api/v1/assets/${assetId}`);
}

/**
 * Uploads raw bytes directly to the presigned MinIO PUT URL returned by
 * `requestUploadUrl`. This deliberately bypasses `src/core/api/client.ts` —
 * the upload URL points at object storage, not our API host, takes no
 * bearer token, and expects the raw binary body (not JSON).
 */
export async function uploadToPresignedUrl(uploadUrl: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    // `fetch` accepts a Uint8Array body fine at runtime (RN + browsers).
    // The cast works around `@types/node`'s `BodyInit` (pulled in globally
    // by some other dependency) not lining up with TS 6's generic
    // `Uint8Array<ArrayBufferLike>` the way lib.dom's `BodyInit` does.
    body: bytes as BodyInit,
    headers: { 'Content-Type': contentType },
  });

  if (!response.ok) {
    throw new Error(`Upload to storage failed: ${response.status} ${response.statusText}`);
  }
}

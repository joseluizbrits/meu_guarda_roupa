import { api } from '@/src/core/api/client';

export type WardrobeCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory';

export type WardrobeItemRead = {
  id: string;
  category: WardrobeCategory;
  photo_asset_id: string;
  photo_url: string;
  texture_asset_id: string | null;
  texture_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateWardrobeItemPayload = {
  category: WardrobeCategory;
  photo_asset_id: string;
};

export type UpdateWardrobeItemPayload = {
  category: WardrobeCategory;
};

export async function createWardrobeItem(payload: CreateWardrobeItemPayload): Promise<WardrobeItemRead> {
  return api.post<WardrobeItemRead>('/api/v1/wardrobe-items', payload);
}

/** Most-recent-first, per the backend contract. */
export async function listWardrobeItems(): Promise<WardrobeItemRead[]> {
  return api.get<WardrobeItemRead[]>('/api/v1/wardrobe-items');
}

export async function getWardrobeItem(id: string): Promise<WardrobeItemRead> {
  return api.get<WardrobeItemRead>(`/api/v1/wardrobe-items/${id}`);
}

export async function updateWardrobeItem(id: string, payload: UpdateWardrobeItemPayload): Promise<WardrobeItemRead> {
  return api.patch<WardrobeItemRead>(`/api/v1/wardrobe-items/${id}`, payload);
}

/**
 * Sets (or replaces) the on-device background-removal cutout for an item.
 * Best-effort by design at the call site (`app/wardrobe/tag.tsx`) — a
 * failure here shouldn't block the item from having already been saved
 * with just its raw photo.
 */
export async function setWardrobeItemTexture(id: string, textureAssetId: string): Promise<WardrobeItemRead> {
  return api.put<WardrobeItemRead>(`/api/v1/wardrobe-items/${id}/texture`, { texture_asset_id: textureAssetId });
}

export async function deleteWardrobeItem(id: string): Promise<void> {
  await api.delete<void>(`/api/v1/wardrobe-items/${id}`);
}

import { api } from '@/src/core/api/client';

export type WardrobeCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory';

export type WardrobeItemRead = {
  id: string;
  category: WardrobeCategory;
  photo_asset_id: string;
  photo_url: string;
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

export async function deleteWardrobeItem(id: string): Promise<void> {
  await api.delete<void>(`/api/v1/wardrobe-items/${id}`);
}

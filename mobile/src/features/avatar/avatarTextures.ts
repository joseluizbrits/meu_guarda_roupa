import { Platform } from 'react-native';
import * as THREE from 'three';

/**
 * Shared promise-cache for remote textures used by the 3D avatar.
 *
 * Lives at module scope (not per-component) so it spans the whole screen
 * session: the Fitting Room pre-warms it with every wearable item after the
 * wardrobe fetch, then `Avatar3DView` only ever pays the network cost once
 * per URL — swapping a garment on the mannequin reuses the already-decoded
 * texture instead of re-fetching MinIO.
 */

const textureCache = new Map<string, Promise<THREE.Texture | null>>();

async function loadTexture(url: string): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    return new THREE.TextureLoader().loadAsync(url);
  }
  const { TextureLoader } = await import('expo-three');
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url, resolve, undefined, reject);
  });
}

async function loadTextureSafe(url: string): Promise<THREE.Texture | null> {
  try {
    return await loadTexture(url);
  } catch {
    return null;
  }
}

/** Returns the cached (or newly loaded) texture for a URL; null on failure. */
export function loadTextureCached(url: string): Promise<THREE.Texture | null> {
  let pending = textureCache.get(url);
  if (!pending) {
    pending = loadTextureSafe(url);
    textureCache.set(url, pending);
  }
  return pending;
}

/**
 * Pre-warms the cache for a batch of URLs (fire-and-forget). Called with the
 * full wearable list when the wardrobe loads, so selecting an item later is
 * instant. Failures just leave that entry unresolved-free for the direct
 * loader to retry — ignore them here.
 */
export function warmTextureCache(urls: string[]): void {
  for (const url of urls) {
    loadTextureCached(url).catch(() => {
      // Ignored — the eventual per-item load will surface any real error.
    });
  }
}
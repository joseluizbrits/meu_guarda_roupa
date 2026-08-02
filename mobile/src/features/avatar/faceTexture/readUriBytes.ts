import { Platform } from 'react-native';
import { File } from 'expo-file-system';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Reads the raw bytes behind a URI produced by `compositeToTexture`:
 * - Web: a `data:image/png;base64,...` URI — decoded in place, no
 *   filesystem access needed (and none is available — see
 *   `compositeToTexture.ts`).
 * - Native: a `file://` URI — read via `expo-file-system`.
 */
export async function readUriBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web' || uri.startsWith('data:')) {
    const base64 = uri.split(',')[1] ?? '';
    return base64ToBytes(base64);
  }
  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

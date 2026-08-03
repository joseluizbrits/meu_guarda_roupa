import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/**
 * Reads the raw bytes behind a URI. Used for photos from more than one
 * source now (composited face textures, camera captures, gallery picks via
 * `expo-image-picker`), which don't all share one URI scheme on web — a
 * composited texture is a `data:image/png;base64,...` URI, but a
 * gallery-picked file is a `blob:...` URI (`expo-image-picker` uses
 * `URL.createObjectURL` on web). `fetch()` transparently handles both (and
 * `http(s):` URIs too), so there's no need to branch on scheme — a previous
 * version of this function assumed every web URI was a `data:` one and
 * silently produced zero bytes for anything else.
 *
 * - Web: no local filesystem access — `fetch(uri).arrayBuffer()` works
 *   directly against `data:`/`blob:`/`http(s):` alike.
 * - Native: a `file://` URI — read via `expo-file-system`.
 */
export async function readUriBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

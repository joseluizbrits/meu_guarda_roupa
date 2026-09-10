import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, GestureResponderEvent, Image, PanResponder, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { Text, View as ThemedView } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { ApiError } from '@/src/core/api/client';
import { virtualizeWardrobeItem } from '@/src/core/api/wardrobe';
import { loadSkia } from '@/src/features/wardrobe/segmentation/loadSkia';

type BrushMode = 'add' | 'erase';
type BrushSize = 28 | 56 | 100;

const BRUSH_SIZES: BrushSize[] = [28, 56, 100];

/**
 * Manual garment-mask editor for the "virtualize" flow.
 *
 * The user paints (brush add / eraser) over the garment on the item's raw
 * photo. The strokes are stamped onto a Skia surface at the photo's ORIGINAL
 * pixel dimensions and exported as a PNG where the painted area is opaque
 * white and everything else is transparent — exactly OpenAI's `images.edit`
 * mask semantics (transparent = regenerate, opaque = preserve), and the same
 * dimensions as the source photo so the backend can apply the same square
 * normalize transform to both before calling the API.
 *
 * Drawing code never holds a stale callback: the PanResponder is created
 * once, and the handlers read the latest brush config/geometry from
 * `latestRef` (updated on every render), so toggling brush mode/size or
 * waiting for the container to lay out never desyncs the touch mapping.
 */
export default function MaskEditorScreen() {
  const { id, photoUrl } = useLocalSearchParams<{ id: string; photoUrl: string }>();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoNaturalSize, setPhotoNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [displayedRect, setDisplayedRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [brushMode, setBrushMode] = useState<BrushMode>('add');
  const [brushSize, setBrushSize] = useState<BrushSize>(56);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maskRef = useRef<{ surface: any; canvas: any } | null>(null);
  const skiaRef = useRef<any>(null);
  const containerLayoutRef = useRef<{ width: number; height: number } | null>(null);
  // Latest values for the (once-created) PanResponder handlers to read.
  const latestRef = useRef({ brushMode, brushSize, displayedRect, photoNaturalSize });
  latestRef.current = { brushMode, brushSize, displayedRect, photoNaturalSize };

  // Download the raw photo and read its natural size.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const rawPhoto = await File.downloadFileAsync(photoUrl, Paths.cache, { idempotent: true });
        if (cancelled) {
          return;
        }
        setPhotoUri(rawPhoto.uri);
        const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          Image.getSize(rawPhoto.uri, (width, height) => resolve({ width, height }), reject);
        });
        if (!cancelled) {
          setPhotoNaturalSize(size);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load photo.');
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  // Initialize the (transparent) mask surface at the photo's pixel size.
  useEffect(() => {
    let cancelled = false;
    async function initSkia() {
      if (!photoUri || !photoNaturalSize) {
        return;
      }
      try {
        const { Skia } = await loadSkia();
        const surface = Skia.Surface.Make(photoNaturalSize.width, photoNaturalSize.height);
        if (!surface) {
          throw new Error('Could not allocate mask surface');
        }
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('rgba(0,0,0,0)'));
        if (!cancelled) {
          skiaRef.current = Skia;
          maskRef.current = { surface, canvas };
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not initialize editor.');
        }
      }
    }
    initSkia();
    return () => {
      cancelled = true;
    };
  }, [photoUri, photoNaturalSize]);

  // Recompute where the contain-fitted photo actually sits in the viewport.
  const recomputeDisplayedRect = useCallback(() => {
    const container = containerLayoutRef.current;
    const size = latestRef.current.photoNaturalSize;
    if (!container || !size) {
      return;
    }
    const { width: containerW, height: containerH } = container;
    const imgAspect = size.width / size.height;
    const containerAspect = containerW / containerH;
    let displayedW: number;
    let displayedH: number;
    let x: number;
    let y: number;
    if (imgAspect > containerAspect) {
      displayedW = containerW;
      displayedH = containerW / imgAspect;
      x = 0;
      y = (containerH - displayedH) / 2;
    } else {
      displayedH = containerH;
      displayedW = containerH * imgAspect;
      x = (containerW - displayedW) / 2;
      y = 0;
    }
    setDisplayedRect({ x, y, width: displayedW, height: displayedH });
  }, []);

  // Container can lay out before the photo's size is known — recompute then.
  useEffect(() => {
    recomputeDisplayedRect();
  }, [photoNaturalSize, recomputeDisplayedRect]);

  const onContainerLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      containerLayoutRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
      recomputeDisplayedRect();
    },
    [recomputeDisplayedRect]
  );

  // Stamp a brush circle at the touch point, mapped into image pixels.
  function stampAt(touchX: number, touchY: number) {
    const skia = skiaRef.current;
    const mask = maskRef.current;
    if (!skia || !mask?.canvas) {
      return;
    }
    const { brushMode: mode, brushSize: size, displayedRect: rect, photoNaturalSize: natural } = latestRef.current;
    if (!rect || !natural) {
      return;
    }
    const { x: dispX, y: dispY, width: dispW, height: dispH } = rect;
    if (touchX < dispX || touchX > dispX + dispW || touchY < dispY || touchY > dispY + dispH) {
      return;
    }
    const imgX = ((touchX - dispX) * natural.width) / dispW;
    const imgY = ((touchY - dispY) * natural.height) / dispH;

    const paint = skia.Paint();
    paint.setAntiAlias(true);
    paint.setStyle(skia.PaintStyle.Fill);
    paint.setStrokeCap(skia.StrokeCap.Round);
    if (mode === 'add') {
      paint.setColor(skia.Color('white'));
    } else {
      // DstOut punches a transparent hole in what was painted before.
      paint.setBlendMode(skia.BlendMode.DstOut);
      paint.setColor(skia.Color('transparent'));
    }
    mask.canvas.drawCircle(imgX, imgY, size, paint);
    mask.surface?.flush();
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => stampAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e: GestureResponderEvent) => stampAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
    })
  ).current;

  // Snapshot the mask, upload it as a garment_mask asset, and ask the
  // backend to regenerate the product photo with it as the edit mask.
  const handleGenerate = useCallback(async () => {
    if (!maskRef.current?.surface || !skiaRef.current || !id) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const skia = skiaRef.current;
      maskRef.current.surface.flush();
      const outputImage = maskRef.current.surface.makeImageSnapshot();
      let maskUri: string;
      if (Platform.OS === 'web') {
        const base64 = outputImage.encodeToBase64(skia.ImageFormat.PNG, 100);
        maskUri = `data:image/png;base64,${base64}`;
      } else {
        const bytes = outputImage.encodeToBytes(skia.ImageFormat.PNG, 100);
        const file = new File(Paths.cache, `garment-mask-${Date.now()}.png`);
        file.create({ overwrite: true });
        file.write(bytes);
        maskUri = file.uri;
      }

      const maskBytes = await readUriBytes(maskUri);
      const upload = await requestUploadUrl('garment_mask', 'image/png');
      await uploadToPresignedUrl(upload.upload_url, maskBytes, 'image/png');
      await virtualizeWardrobeItem(id, { mask_asset_id: upload.asset_id });

      router.back();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not generate product photo.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [id]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  if (!photoUri || !photoNaturalSize || !displayedRect) {
    return (
      <>
        <Stack.Screen options={{ title: 'Recortar peça' }} />
        <ThemedView style={styles.container}>
          <ThemedView style={styles.center}>
            <ActivityIndicator size="large" />
          </ThemedView>
        </ThemedView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Recortar peça', headerLeft: () => null }} />
      <ThemedView style={styles.container} onLayout={onContainerLayout}>
        <Text style={styles.instruction}>Pinte sobre a peça — borracha remove</Text>

        <View style={styles.photoWrapper} {...panResponder.panHandlers}>
          <Image
            source={{ uri: photoUri }}
            style={[styles.photo, { width: displayedRect.width, height: displayedRect.height }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.controls}>
          <View style={styles.modeToggle}>
            <Button title="Pincel" onPress={() => setBrushMode('add')} style={styles.modeButton} disabled={busy} />
            <Button title="Borracha" onPress={() => setBrushMode('erase')} style={styles.modeButton} disabled={busy} />
          </View>

          <View style={styles.sizeToggle}>
            {BRUSH_SIZES.map((size) => (
              <Button
                key={size}
                title={`${size}px`}
                onPress={() => setBrushSize(size)}
                style={brushSize === size ? { ...styles.sizeButton, ...styles.sizeButtonActive } : styles.sizeButton}
                disabled={busy}
              />
            ))}
          </View>
        </View>

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <View style={styles.actions}>
          <Button title="Cancelar" onPress={handleBack} disabled={busy} style={styles.secondaryButton} />
          <Button
            title={busy ? 'Gerando...' : 'Gerar foto de produto'}
            onPress={handleGenerate}
            loading={busy}
            disabled={busy}
            style={styles.primaryButton}
          />
        </View>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruction: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    color: '#888',
  },
  photoWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  photo: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  controls: {
    marginBottom: 20,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
  },
  sizeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeButton: {
    flex: 1,
    paddingVertical: 10,
  },
  sizeButtonActive: {
    opacity: 1,
  },
  error: {
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
  },
  primaryButton: {
    flex: 1,
  },
});
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet, Switch } from 'react-native';
import type { SkImage } from '@shopify/react-native-skia';
import { Stack, router } from 'expo-router';
import { File, Paths } from 'expo-file-system';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { createWardrobeItem, detectGarments, WardrobeCategory } from '@/src/core/api/wardrobe';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';
import { extractGarmentCutout } from '@/src/features/wardrobe/segmentation/extractGarmentCutout';
import { loadSkia } from '@/src/features/wardrobe/segmentation/loadSkia';
import { tfliteSegmentationEngine } from '@/src/features/wardrobe/segmentation/tfliteSegmentationEngine';

const THUMB_SIZE = 256;
const VALID_CATEGORIES: WardrobeCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];
type SkiaModule = Awaited<ReturnType<typeof loadSkia>>;

function coerceCategory(value: string | null | undefined): WardrobeCategory {
  return VALID_CATEGORIES.includes(value as WardrobeCategory) ? (value as WardrobeCategory) : 'accessory';
}

/**
 * Crops the piece's normalized bbox out of a *pre-decoded* photo with Skia
 * and encodes it as a PNG file (native) or data URI (web). `out` is the
 * output square side in pixels (`THUMB_SIZE` for the grid preview, or `0`
 * for the full-resolution crop used before on-device segmentation).
 *
 * The caller decodes the source photo ONCE (see `handleConfirm`) and reuses
 * that `SkImage` for every piece — decoding a multi-megapixel photo five
 * times in parallel is what silently OOM'd the grid confirm before.
 */
async function cropPiecePhoto(
  image: SkImage,
  piece: { box: { x_min: number; y_min: number; x_max: number; y_max: number } },
  photoW: number,
  photoH: number,
  out: number,
  skia: SkiaModule
): Promise<string> {
  const { Skia, ImageFormat } = skia;
  const srcX = Math.max(0, Math.min(photoW - 1, Math.round(piece.box.x_min * photoW)));
  const srcY = Math.max(0, Math.min(photoH - 1, Math.round(piece.box.y_min * photoH)));
  const srcW = Math.max(1, Math.min(photoW - srcX, Math.round(piece.box.x_max * photoW) - srcX));
  const srcH = Math.max(1, Math.min(photoH - srcY, Math.round(piece.box.y_max * photoH) - srcY));
  const srcRect = Skia.XYWHRect(srcX, srcY, srcW, srcH);

  const dstW = out === 0 ? srcW : out;
  const dstH = out === 0 ? srcH : out;
  const surface = Skia.Surface.Make(dstW, dstH);
  if (!surface) {
    throw new Error('select-pieces: could not allocate crop surface.');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('rgba(0,0,0,0)'));

  // Thumbnails letterbox the crop into a square; full-res crops fill exactly.
  let dstRect = Skia.XYWHRect(0, 0, srcW, srcH);
  if (out !== 0) {
    const scale = Math.min(out / srcW, out / srcH);
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    dstRect = Skia.XYWHRect(Math.round((out - w) / 2), Math.round((out - h) / 2), w, h);
  }
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(image, srcRect, dstRect, paint);
  surface.flush();
  const output = surface.makeImageSnapshot();

  if (Platform.OS === 'web') {
    return `data:image/png;base64,${output.encodeToBase64(ImageFormat.PNG, 90)}`;
  }
  const bytes = output.encodeToBytes(ImageFormat.PNG, 90);
  const file = new File(Paths.cache, `piece-crop-${Date.now()}-${Math.round(srcX)}-${Math.round(srcY)}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

type PieceCardProps = {
  piece: { label: string; box: { x_min: number; y_min: number; x_max: number; y_max: number } };
  index: number;
  kept: boolean;
  category: WardrobeCategory;
  photoUri: string;
  photoW: number;
  photoH: number;
  onToggle: (index: number) => void;
  onCategory: (index: number, category: WardrobeCategory) => void;
};

function PieceCard({ piece, index, kept, category, photoUri, photoW, photoH, onToggle, onCategory }: PieceCardProps) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const skia = await loadSkia();
        const { Skia } = skia;
        const data = await Skia.Data.fromURI(photoUri);
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (!image) {
          throw new Error('select-pieces: could not decode source photo.');
        }
        const uri = await cropPiecePhoto(image, piece, photoW, photoH, THUMB_SIZE, skia);
        if (!cancelled) {
          setThumb(uri);
        }
      } catch {
        // Thumbnail is a preview nicety — leave a spinner placeholder.
      }
    })();
    return () => {
      cancelled = true;
    };
    // cropPiecePhoto is stable per route visit; recompute only when the piece
    // or photo changes (photoUri/photoW/photoH are fixed for this screen).
  }, [piece, photoUri, photoW, photoH]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: kept }}
      onPress={() => onToggle(index)}
      style={[styles.card, kept ? styles.cardKept : styles.cardDropped]}
    >
      <View style={styles.thumb}>
        {thumb ? <Image source={{ uri: thumb }} style={styles.thumbImage} resizeMode="cover" /> : <ActivityIndicator />}
        <View style={styles.cardLabelRow}>
          <Text style={styles.cardLabel} numberOfLines={1}>
            {piece.label}
          </Text>
          <Switch value={kept} onValueChange={() => onToggle(index)} />
        </View>
      </View>
      <CategoryPicker value={category} onChange={(c) => c && onCategory(index, c)} />
    </Pressable>
  );
}

/**
 * Multi-garment selection grid: shows each piece detected by the backend
 * (bbox-cropped thumbnail), lets the user keep/drop it and tweak its category,
 * then batch-creates one wardrobe item per kept piece (full-res crop +
 * on-device U2Net cutout when available, plain crop otherwise).
 */
export default function SelectPiecesScreen() {
  const photoUri = useCapturedGarmentPhotoStore((state) => state.uri);
  const photoW = useCapturedGarmentPhotoStore((state) => state.width);
  const photoH = useCapturedGarmentPhotoStore((state) => state.height);
  const contentType = useCapturedGarmentPhotoStore((state) => state.contentType);
  const detections = useCapturedGarmentPhotoStore((state) => state.detections);
  const photoAssetId = useCapturedGarmentPhotoStore((state) => state.photoAssetId);
  const setDetections = useCapturedGarmentPhotoStore((state) => state.setDetections);
  const clearPhoto = useCapturedGarmentPhotoStore((state) => state.clear);

  const [kept, setKept] = useState<boolean[]>([]);
  const [categories, setCategories] = useState<WardrobeCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards the one-shot auto-detect: when the user lands here right after
  // capturing (no detections stored yet) we upload the raw photo and run
  // the backend detect automatically. A ref keeps this from re-firing on
  // re-renders or after a failed attempt (which must be re-triggered by the
  // explicit "Tentar novamente" button, not loop forever).
  const autoDetectAttempted = useRef(false);

  useEffect(() => {
    if (detections !== null || autoDetectAttempted.current) {
      return;
    }
    autoDetectAttempted.current = true;
    let cancelled = false;
    (async () => {
      if (!photoUri || !contentType) {
        return;
      }
      try {
        const bytes = await readUriBytes(photoUri);
        const { asset_id, upload_url } = await requestUploadUrl('garment_photo', contentType);
        await uploadToPresignedUrl(upload_url, bytes, contentType);
        const data = await detectGarments(asset_id);
        if (!cancelled) {
          setDetections(data.pieces, asset_id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Detecção falhou. Tente novamente.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detections, photoUri, contentType, setDetections]);

  const pieces = useMemo(() => detections ?? [], [detections]);
  useEffect(() => {
    setKept(pieces.map(() => true));
    setCategories(pieces.map((p) => coerceCategory(p.category)));
  }, [pieces]);

  const keptCount = pieces.reduce((n, _, i) => n + (kept[i] ? 1 : 0), 0);

  const handleRetry = useCallback(async () => {
    if (!photoAssetId) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await detectGarments(photoAssetId);
      setDetections(data.pieces, photoAssetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detecção falhou. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }, [photoAssetId, setDetections]);

  // Retry for the one-shot auto-detect: if it failed before an asset was
  // ever uploaded (photoAssetId still null), this re-uploads the raw photo
  // and runs detection again from scratch.
  const handleAutoDetectRetry = useCallback(async () => {
    if (!photoUri || !contentType) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const bytes = await readUriBytes(photoUri);
      const { asset_id, upload_url } = await requestUploadUrl('garment_photo', contentType);
      await uploadToPresignedUrl(upload_url, bytes, contentType);
      const data = await detectGarments(asset_id);
      autoDetectAttempted.current = false;
      setDetections(data.pieces, asset_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detecção falhou. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }, [photoUri, contentType, setDetections]);

  const handleConfirm = useCallback(async () => {
    if (!photoUri || !photoW || !photoH) {
      return;
    }
    const selectedIndexes = pieces.map((_, i) => i).filter((i) => kept[i]);
    if (selectedIndexes.length === 0) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Phase 1: decode the source photo ONCE, then crop + on-device cutout
      // per piece SEQUENTIALLY. (Decoding a multi-megapixel photo once per
      // piece in parallel is what previously OOM'd mid-grid — and the old
      // allSettled silently dropped the failed pieces, so the user picked 5
      // and only 2 reached the closet.) A piece that still fails is counted
      // and surfaced, never silently dropped.
      setProgress(`Preparando peças 0/${selectedIndexes.length}…`);
      const skia = await loadSkia();
      const { Skia } = skia;
      const data = await Skia.Data.fromURI(photoUri);
      const sourceImage = Skia.Image.MakeImageFromEncoded(data);
      if (!sourceImage) {
        throw new Error('select-pieces: could not decode source photo.');
      }

      const ready: { category: WardrobeCategory; photoUri: string; label: string }[] = [];
      const droppedLabels: string[] = [];
      for (let job = 0; job < selectedIndexes.length; job += 1) {
        const pieceIndex = selectedIndexes[job];
        const piece = pieces[pieceIndex];
        setProgress(`Preparando peças ${job + 1}/${selectedIndexes.length}…`);
        try {
          const cropUri = await cropPiecePhoto(sourceImage, piece, photoW, photoH, 0, skia);
          let photo = cropUri;
          if (Platform.OS !== 'web') {
            try {
              const segmentation = await tfliteSegmentationEngine.segment(cropUri);
              if (segmentation) {
                photo = await extractGarmentCutout(cropUri, segmentation.maskUri);
              }
            } catch {
              // Fall back to the plain crop; reprocess is available later.
            }
          }
          ready.push({ category: categories[pieceIndex], photoUri: photo, label: piece.label });
        } catch {
          droppedLabels.push(piece.label);
        }
      }

      // Phase 2: upload + create one wardrobe item per ready piece.
      let created = 0;
      let failed = 0;
      for (let i = 0; i < ready.length; i += 1) {
        setProgress(`Adicionando ao closet ${i + 1}/${ready.length}…`);
        try {
          const bytes = await readUriBytes(ready[i].photoUri);
          const upload = await requestUploadUrl('garment_photo', 'image/png');
          await uploadToPresignedUrl(upload.upload_url, bytes, 'image/png');
          await createWardrobeItem({ category: coerceCategory(ready[i].category), photo_asset_id: upload.asset_id });
          created += 1;
        } catch {
          failed += 1;
        }
      }

      if (created === 0) {
        setError('Nenhuma peça pôde ser adicionada. Tente novamente.');
        return;
      }
      clearPhoto();
      router.replace('/closet');
      const messages: string[] = [];
      if (droppedLabels.length > 0) {
        messages.push(`${droppedLabels.length} de ${selectedIndexes.length} peças não puderam ser processadas: ${droppedLabels.join(', ')}`);
      }
      if (failed > 0) {
        // Partial success still navigates; surface the shortfall after the
        // move so the user notices but is not blocked.
        messages.push(`${failed} de ${ready.length} peças não puderam ser adicionadas.`);
      }
      if (messages.length > 0) {
        setTimeout(() => alert(messages.join('\n')), 300);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [photoUri, photoW, photoH, pieces, kept, categories, clearPhoto]);

  if (!photoUri || !photoW || !photoH || detections === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Escolher peças' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>
            {error ? 'Detecção falhou. Tente novamente.' : 'Detectando peças na foto…'}
          </Text>
          {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}
          {error ? (
            <Button title="Tentar novamente" onPress={handleAutoDetectRetry} loading={busy} disabled={busy} />
          ) : null}
        </View>
      </>
    );
  }

  if (pieces.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Escolher peças' }} />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nenhuma peça detectada</Text>
          <Text style={styles.emptySubtitle}>Tente outra foto com a peça mais visível.</Text>
          {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}
          <View style={styles.emptyActions}>
            <Button title="Voltar" onPress={() => router.back()} disabled={busy} style={styles.secondaryButton} />
            <Button title="Tentar novamente" onPress={handleRetry} loading={busy} disabled={busy} />
          </View>
          <View style={styles.emptyActions}>
            <Button title="Adicionar manualmente" onPress={() => router.replace('/wardrobe/tag')} disabled={busy} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Escolher peças' }} />
      <View style={styles.container}>
        {progress || busy ? <Text style={styles.progress}>{progress ?? 'Processando…'}</Text> : null}
        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <FlatList
          data={pieces}
          keyExtractor={(_, index) => String(index)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <PieceCard
              piece={item}
              index={index}
              kept={kept[index] ?? true}
              category={categories[index] ?? coerceCategory(item.category)}
              photoUri={photoUri}
              photoW={photoW}
              photoH={photoH}
              onToggle={(i) => setKept((prev) => prev.map((v, j) => (j === i ? !v : v)))}
              onCategory={(i, category) => setCategories((prev) => prev.map((v, j) => (j === i ? category : v)))}
            />
          )}
        />

        <View style={styles.actions}>
          <Button title="Voltar" onPress={() => router.back()} disabled={busy} style={styles.secondaryButton} />
          <Button
            title={`Adicionar ${keptCount} ${keptCount === 1 ? 'peça' : 'peças'} ao closet`}
            onPress={handleConfirm}
            loading={busy}
            disabled={busy || keptCount === 0}
          />
        </View>
      </View>
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
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  listContent: {
    paddingBottom: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  cardKept: {
    borderColor: '#34c759',
  },
  cardDropped: {
    borderColor: 'rgba(0,0,0,0.08)',
    opacity: 0.6,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  progress: {
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 14,
    opacity: 0.8,
  },
  error: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },
});
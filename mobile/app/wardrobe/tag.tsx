import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { createWardrobeItem, setWardrobeItemTexture, WardrobeCategory } from '@/src/core/api/wardrobe';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { classifyGarmentPhoto, type GarmentClassification } from '@/src/features/wardrobe/classification/garmentClassifier';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';
import { extractGarmentCutout } from '@/src/features/wardrobe/segmentation/extractGarmentCutout';
import { tfliteSegmentationEngine } from '@/src/features/wardrobe/segmentation/tfliteSegmentationEngine';

/**
 * Second (and final) step of the garment capture flow — shows the just-taken
 * photo, lets the user pick its category, then on confirm: uploads the raw
 * photo (unchanged) and creates the wardrobe item.
 *
 * As soon as a photo is available, this also kicks off on-device background
 * removal (`tfliteSegmentationEngine`) — unconditionally, always, for every
 * photo — and swaps the preview to the resulting transparent cutout once
 * it's ready. This is best-effort and native-only (see
 * `tfliteSegmentationEngine.ts`) — on web, or if segmentation/compositing
 * fails for any reason, `cutoutUri` just stays `null` and the raw photo
 * keeps showing; saving is never blocked on it. `classifyGarmentPhoto` runs
 * *after* that, against the cutout when there is one (an isolated garment
 * is a cleaner signal for ML Kit than the raw photo with its background) —
 * purely to persist as `ml_analysis` at save time, it does not gate
 * segmentation (it used to; the heuristic proved too unreliable in
 * practice).
 */
export default function TagGarmentScreen() {
  const photoUri = useCapturedGarmentPhotoStore((state) => state.uri);
  const contentType = useCapturedGarmentPhotoStore((state) => state.contentType);
  const clearPhoto = useCapturedGarmentPhotoStore((state) => state.clear);

  const [category, setCategory] = useState<WardrobeCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [cutoutUri, setCutoutUri] = useState<string | null>(null);
  const [classification, setClassification] = useState<GarmentClassification | null>(null);
  // Same trick as `app/onboarding/review.tsx`: `clearPhoto()` on success
  // flips `photoUri` to null right before navigating away, which would
  // otherwise race the "no photo, go capture one" redirect below.
  const confirmedSuccessfully = useRef(false);

  useEffect(() => {
    if (!photoUri && !confirmedSuccessfully.current) {
      // Nothing captured (e.g. deep-linked straight into this screen) —
      // send the user back to capture a photo first.
      router.replace('/wardrobe/capture');
    }
  }, [photoUri]);

  useEffect(() => {
    if (!photoUri) {
      return;
    }
    let cancelled = false;
    setCutoutUri(null);
    setClassification(null);
    setSegmenting(true);
    (async () => {
      // Classification runs *after* segmentation, against the cutout when
      // one comes out of it — falls back to the raw photo otherwise
      // (segmentation failed, or on web where it's always null). Feeds
      // extractGarmentCutout's output as-is either way, at whatever size
      // it already produces — not resizing that further here.
      let uriToClassify = photoUri;
      try {
        const segmentation = await tfliteSegmentationEngine.segment(photoUri);
        if (!segmentation) {
          console.warn('[tag] segmentation engine returned null — no mask, falling back to raw photo');
        } else {
          const uri = await extractGarmentCutout(photoUri, segmentation.maskUri);
          if (!cancelled) {
            setCutoutUri(uri);
            uriToClassify = uri;
          }
        }
      } catch (error) {
        // Best-effort — leave `cutoutUri` null and fall back to the raw
        // photo, both for the preview and at confirm time below. Logged so
        // a real on-device failure is diagnosable instead of silent.
        console.warn('[tag] cutout extraction failed, falling back to raw photo:', error);
      }

      if (cancelled) {
        return;
      }
      try {
        const classificationResult = await classifyGarmentPhoto(uriToClassify);
        if (!cancelled) {
          setClassification(classificationResult);
          if (classificationResult?.suggestedCategory) {
            // Functional update, not a direct read of `category`: this
            // resolves a second or two after the photo is taken, so the
            // user may have already picked a category by hand while
            // waiting — never clobber that, only fill in an actual blank.
            setCategory((current) => current ?? classificationResult.suggestedCategory);
          }
        }
      } finally {
        if (!cancelled) {
          setSegmenting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoUri]);

  async function handleConfirm() {
    if (!photoUri || !contentType || !category) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const bytes = await readUriBytes(photoUri);
      const { asset_id, upload_url } = await requestUploadUrl('garment_photo', contentType);
      await uploadToPresignedUrl(upload_url, bytes, contentType);
      const item = await createWardrobeItem({
        category,
        photo_asset_id: asset_id,
        ml_analysis: classification
          ? {
              raw_labels: classification.rawLabels,
              is_likely_garment: classification.isLikelyGarment,
              top_label: classification.topLabel,
              top_confidence: classification.confidence,
              segmentation_succeeded: cutoutUri !== null,
            }
          : undefined,
      });

      // The cutout is a nice-to-have, never a save blocker: any failure
      // here just leaves the item saved with its raw photo only, exactly
      // like today.
      if (cutoutUri) {
        try {
          const textureBytes = await readUriBytes(cutoutUri);
          const textureUpload = await requestUploadUrl('garment_texture', 'image/png');
          await uploadToPresignedUrl(textureUpload.upload_url, textureBytes, 'image/png');
          await setWardrobeItemTexture(item.id, textureUpload.asset_id);
        } catch {
          // Ignored — see comment above.
        }
      }

      confirmedSuccessfully.current = true;
      clearPhoto();
      router.replace('/closet');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleRetake() {
    clearPhoto();
    router.replace('/wardrobe/capture');
  }

  if (!photoUri) {
    // The effect above is already redirecting away — render nothing
    // in the meantime rather than crashing on a null image source.
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Tag garment' }} />
      <View style={styles.container}>
        <Text style={styles.title}>What is this?</Text>
        <Text style={styles.subtitle}>Pick a category for this item.</Text>

        <View style={styles.previewWrapper}>
          <Image source={{ uri: cutoutUri ?? photoUri }} style={styles.preview} resizeMode="contain" />
          {segmenting ? (
            <View style={styles.segmentingBadge}>
              <ActivityIndicator size="small" />
              <Text style={styles.segmentingText}>Removing background...</Text>
            </View>
          ) : null}
        </View>

        <CategoryPicker value={category} onChange={setCategory} disabled={saving} />

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <Button
          title={saving ? 'Saving...' : 'Add to wardrobe'}
          onPress={handleConfirm}
          loading={saving}
          disabled={!category || saving}
        />
        <View style={styles.retake}>
          <Button title="Retake photo" onPress={handleRetake} disabled={saving} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 24,
    textAlign: 'center',
  },
  previewWrapper: {
    width: '100%',
    marginBottom: 24,
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  segmentingBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  segmentingText: {
    color: '#fff',
    fontSize: 12,
  },
  error: {
    marginBottom: 16,
  },
  retake: {
    marginTop: 12,
    width: '100%',
  },
});

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { createWardrobeItem, WardrobeCategory } from '@/src/core/api/wardrobe';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { classifyGarmentPhoto, type GarmentClassification } from '@/src/features/wardrobe/classification/garmentClassifier';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';

/**
 * Manual single-garment fallback: shows the just-taken photo, lets the user
 * pick its category, then on confirm uploads the raw photo (unchanged) and
 * creates the wardrobe item. This is the escape hatch when automatic
 * multi-garment detection found nothing — the primary flow from capture goes
 * straight to `select-pieces`. No background removal here: the raw photo is
 * kept as-is and no cutout is produced or saved. `classifyGarmentPhoto` runs
 * best-effort against the raw photo just to persist an `ml_analysis` hint on
 * save (fills a blank category when it resolves before the user picks).
 */
export default function TagGarmentScreen() {
  const photoUri = useCapturedGarmentPhotoStore((state) => state.uri);
  const contentType = useCapturedGarmentPhotoStore((state) => state.contentType);
  const clearPhoto = useCapturedGarmentPhotoStore((state) => state.clear);

  const [category, setCategory] = useState<WardrobeCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    (async () => {
      try {
        const classificationResult = await classifyGarmentPhoto(photoUri);
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
      } catch {
        // Best-effort — classification is only a hint at save time.
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
      await createWardrobeItem({
        category,
        photo_asset_id: asset_id,
        ml_analysis: classification
          ? {
              raw_labels: classification.rawLabels,
              is_likely_garment: classification.isLikelyGarment,
              top_label: classification.topLabel,
              top_confidence: classification.confidence,
              segmentation_succeeded: false,
            }
          : undefined,
      });

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
      <Stack.Screen options={{ title: 'Adicionar peça' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Qual é esta peça?</Text>
        <Text style={styles.subtitle}>Escolha a categoria desta peça.</Text>

        <View style={styles.previewWrapper}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
        </View>

        <CategoryPicker value={category} onChange={setCategory} disabled={saving} />

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <Button
          title={saving ? 'Salvando...' : 'Adicionar ao closet'}
          onPress={handleConfirm}
          loading={saving}
          disabled={!category || saving}
        />
        <View style={styles.retake}>
          <Button title="Refazer foto" onPress={handleRetake} disabled={saving} />
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
  error: {
    marginBottom: 16,
  },
  retake: {
    marginTop: 12,
    width: '100%',
  },
});

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { createWardrobeItem, WardrobeCategory } from '@/src/core/api/wardrobe';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { classifyGarmentPhoto, type GarmentClassification } from '@/src/features/wardrobe/classification/garmentClassifier';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';

export default function TagGarmentScreen() {
  const photoUri = useCapturedGarmentPhotoStore((state) => state.uri);
  const contentType = useCapturedGarmentPhotoStore((state) => state.contentType);
  const clearPhoto = useCapturedGarmentPhotoStore((state) => state.clear);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const [category, setCategory] = useState<WardrobeCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<GarmentClassification | null>(null);
  const confirmedSuccessfully = useRef(false);

  useEffect(() => {
    if (!photoUri && !confirmedSuccessfully.current) {
      router.replace('/wardrobe/capture');
    }
  }, [photoUri]);

  useEffect(() => {
    if (!photoUri) return;
    let cancelled = false;
    (async () => {
      try {
        const classificationResult = await classifyGarmentPhoto(photoUri);
        if (!cancelled) {
          setClassification(classificationResult);
          if (classificationResult?.suggestedCategory) {
            setCategory((current) => current ?? classificationResult.suggestedCategory);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [photoUri]);

  async function handleConfirm() {
    if (!photoUri || !contentType || !category) return;
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

  if (!photoUri) return null;

  return (
    <>
      <Stack.Screen options={{ title: 'Adicionar peça' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.primary }]}>Qual é esta peça?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Escolha a categoria desta peça.
        </Text>

        <View style={styles.previewWrapper}>
          <Image
            source={{ uri: photoUri }}
            style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}
            resizeMode="contain"
          />
        </View>

        <CategoryPicker value={category} onChange={setCategory} disabled={saving} />

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <Button
          title={saving ? 'Salvando...' : 'Adicionar ao closet'}
          onPress={handleConfirm}
          loading={saving}
          disabled={!category || saving}
        />
        <Button
          title="Refazer foto"
          variant="secondary"
          onPress={handleRetake}
          disabled={saving}
          style={styles.retake}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  previewWrapper: {
    width: '100%',
    marginBottom: spacing['2xl'],
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
  },
  error: {
    marginBottom: spacing.lg,
  },
  retake: {
    marginTop: spacing.md,
    width: '100%',
  },
});

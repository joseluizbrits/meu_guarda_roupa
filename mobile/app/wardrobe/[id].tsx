import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { File, Paths } from 'expo-file-system';

import Colors from '@/constants/Colors';
import { spacing, radius, shadow, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { ApiError } from '@/src/core/api/client';
import {
  deleteWardrobeItem,
  getWardrobeItem,
  setWardrobeItemTexture,
  updateWardrobeItem,
  WardrobeItemRead,
} from '@/src/core/api/wardrobe';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { extractGarmentCutout } from '@/src/features/wardrobe/segmentation/extractGarmentCutout';
import { tfliteSegmentationEngine } from '@/src/features/wardrobe/segmentation/tfliteSegmentationEngine';

export default function WardrobeItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const [item, setItem] = useState<WardrobeItemRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      setLoadError(null);
      getWardrobeItem(id)
        .then((result) => { if (!cancelled) setItem(result); })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 404) {
            setLoadError('This item no longer exists.');
          } else {
            setLoadError(err instanceof Error ? err.message : 'Could not load this item.');
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [id])
  );

  async function handleRecategorize(category: WardrobeItemRead['category'] | null) {
    if (!item || category === null || category === item.category) return;
    setSaveError(null);
    setSavingCategory(true);
    try {
      const updated = await updateWardrobeItem(item.id, { category });
      setItem(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update the category.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleReprocess() {
    if (!item) return;
    setReprocessError(null);
    setReprocessing(true);
    try {
      const rawPhoto = await File.downloadFileAsync(item.photo_url, Paths.cache, { idempotent: true });
      const segmentation = await tfliteSegmentationEngine.segment(rawPhoto.uri);
      if (!segmentation) {
        setReprocessError('Could not remove the background on this device.');
        return;
      }
      const cutoutUri = await extractGarmentCutout(rawPhoto.uri, segmentation.maskUri);
      const textureBytes = await readUriBytes(cutoutUri);
      const textureUpload = await requestUploadUrl('garment_texture', 'image/png');
      await uploadToPresignedUrl(textureUpload.upload_url, textureBytes, 'image/png');
      const updated = await setWardrobeItemTexture(item.id, textureUpload.asset_id);
      setItem(updated);
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : 'Could not reprocess this item.');
    } finally {
      setReprocessing(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteWardrobeItem(item.id);
      router.replace('/closet');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this item.');
      setDeleting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Garment' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : loadError || !item ? (
          <View style={styles.center}>
            <ErrorText>{loadError ?? 'Could not load this item.'}</ErrorText>
          </View>
        ) : (
          <>
            <Image
              source={{ uri: item.ai_photo_url ?? item.texture_url ?? item.photo_url }}
              style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
              resizeMode="contain"
            />

            <View style={styles.reprocessSection}>
              <Button
                title="Gerar foto de produto"
                onPress={() =>
                  router.push({
                    pathname: '/wardrobe/mask-editor',
                    params: { id: item.id, photoUrl: item.photo_url },
                  })
                }
              />
              <Button
                title={reprocessing ? 'Reprocessing...' : 'Reprocess background removal'}
                variant="secondary"
                onPress={handleReprocess}
                loading={reprocessing}
                disabled={reprocessing}
              />
              {reprocessError ? <ErrorText style={styles.error}>{reprocessError}</ErrorText> : null}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Category</Text>
            <CategoryPicker value={item.category} onChange={handleRecategorize} disabled={savingCategory} />
            {saveError ? <ErrorText style={styles.error}>{saveError}</ErrorText> : null}

            <View style={styles.deleteSection}>
              {confirmingDelete ? (
                <>
                  <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
                    Delete this item? This cannot be undone.
                  </Text>
                  {deleteError ? <ErrorText style={styles.error}>{deleteError}</ErrorText> : null}
                  <View style={styles.confirmActions}>
                    <View style={styles.confirmButton}>
                      <Button title="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} disabled={deleting} />
                    </View>
                    <View style={styles.confirmButton}>
                      <Button
                        title={deleting ? 'Deleting...' : 'Confirm delete'}
                        variant="danger"
                        onPress={handleDelete}
                        loading={deleting}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <Button title="Delete" variant="danger" onPress={() => setConfirmingDelete(true)} />
              )}
            </View>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing['2xl'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radius.lg,
    marginBottom: spacing['2xl'],
  },
  reprocessSection: {
    width: '100%',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.md,
  },
  error: {
    marginTop: spacing.md,
  },
  deleteSection: {
    marginTop: spacing['3xl'],
  },
  confirmText: {
    ...typography.body,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmButton: {
    flex: 1,
  },
});

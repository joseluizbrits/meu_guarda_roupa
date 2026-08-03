import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { ApiError } from '@/src/core/api/client';
import { deleteWardrobeItem, getWardrobeItem, updateWardrobeItem, WardrobeItemRead } from '@/src/core/api/wardrobe';

/**
 * Garment detail — a larger view of the photo plus re-tag (category picker,
 * saved immediately on change) and delete (behind a simple inline confirm —
 * `Alert.alert` is a no-op on react-native-web, so a native `Alert` here
 * wouldn't actually confirm anything when running on web).
 */
export default function WardrobeItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<WardrobeItemRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) {
        return;
      }
      let cancelled = false;
      setLoading(true);
      setLoadError(null);
      getWardrobeItem(id)
        .then((result) => {
          if (!cancelled) {
            setItem(result);
          }
        })
        .catch((err) => {
          if (cancelled) {
            return;
          }
          if (err instanceof ApiError && err.status === 404) {
            setLoadError('This item no longer exists.');
          } else {
            setLoadError(err instanceof Error ? err.message : 'Could not load this item.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  async function handleRecategorize(category: WardrobeItemRead['category'] | null) {
    // `category` is only ever `null` when `CategoryPicker`'s `allowAll` is
    // set (it isn't here) — this screen always re-tags to one real
    // category, never "no category", but the shared component's `onChange`
    // type covers both callers.
    if (!item || category === null || category === item.category) {
      return;
    }
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

  async function handleDelete() {
    if (!item) {
      return;
    }
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
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : loadError || !item ? (
          <View style={styles.center}>
            <ErrorText>{loadError ?? 'Could not load this item.'}</ErrorText>
          </View>
        ) : (
          <>
            <Image source={{ uri: item.texture_url ?? item.photo_url }} style={styles.photo} resizeMode="contain" />

            <Text style={styles.label}>Category</Text>
            <CategoryPicker value={item.category} onChange={handleRecategorize} disabled={savingCategory} />
            {saveError ? <ErrorText style={styles.error}>{saveError}</ErrorText> : null}

            <View style={styles.deleteSection}>
              {confirmingDelete ? (
                <>
                  <Text style={styles.confirmText}>Delete this item? This cannot be undone.</Text>
                  {deleteError ? <ErrorText style={styles.error}>{deleteError}</ErrorText> : null}
                  <View style={styles.confirmActions}>
                    <View style={styles.confirmButton}>
                      <Button
                        title="Cancel"
                        onPress={() => setConfirmingDelete(false)}
                        disabled={deleting}
                      />
                    </View>
                    <View style={styles.confirmButton}>
                      <Button
                        title={deleting ? 'Deleting...' : 'Confirm delete'}
                        onPress={handleDelete}
                        loading={deleting}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <Button title="Delete" onPress={() => setConfirmingDelete(true)} />
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
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    // Unconstrained, `aspectRatio: 1` scales height to match width — fine
    // on a phone-width screen, but on a wide desktop browser window the
    // container has no other limit, so the image grows to fill most of
    // the viewport. `maxWidth` caps that; `alignSelf: 'center'` keeps it
    // centered once it's narrower than the container.
    maxWidth: 480,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  error: {
    marginTop: 12,
  },
  deleteSection: {
    marginTop: 32,
  },
  confirmText: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
  },
});

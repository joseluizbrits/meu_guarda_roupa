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
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';

/**
 * Second (and final) step of the garment capture flow — shows the just-taken
 * photo, lets the user pick its category, then on confirm: uploads the photo
 * and creates the wardrobe item. No compositing step here (unlike the face
 * texture flow) — the raw photo is stored as-is.
 */
export default function TagGarmentScreen() {
  const photoUri = useCapturedGarmentPhotoStore((state) => state.uri);
  const contentType = useCapturedGarmentPhotoStore((state) => state.contentType);
  const clearPhoto = useCapturedGarmentPhotoStore((state) => state.clear);

  const [category, setCategory] = useState<WardrobeCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await createWardrobeItem({ category, photo_asset_id: asset_id });

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

        <Image source={{ uri: photoUri }} style={styles.preview} />

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
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 24,
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

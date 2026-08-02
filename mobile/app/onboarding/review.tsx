import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { putAvatar } from '@/src/core/api/avatar';
import { requestUploadUrl, uploadToPresignedUrl } from '@/src/core/api/assets';
import { getMeasurements } from '@/src/core/api/measurements';
import { compositeToTexture } from '@/src/features/avatar/faceTexture/compositeToTexture';
import { readUriBytes } from '@/src/features/avatar/faceTexture/readUriBytes';
import { useCapturedPhotoStore } from '@/src/features/onboarding/capturedPhotoStore';
import { useOnboardingStatusStore } from '@/src/features/onboarding/onboardingStatusStore';

/**
 * Onboarding step 3 — composites the raw capture into the circular face
 * texture, lets the user confirm (or retake) it, then on confirm: uploads
 * the texture to object storage and upserts the avatar. This is the last
 * onboarding step — success routes into `(tabs)`.
 */
export default function ReviewScreen() {
  const photoUri = useCapturedPhotoStore((state) => state.uri);
  const clearPhoto = useCapturedPhotoStore((state) => state.clear);

  const [compositedUri, setCompositedUri] = useState<string | null>(null);
  const [compositing, setCompositing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `handleConfirm` clears the captured photo on success right before
  // navigating to `(tabs)`. That clear flips `photoUri` to null, which would
  // otherwise re-trigger the "no photo, go capture one" effect below and
  // race it against the success navigation — sending the user back to
  // face-capture immediately after a successful save. This ref lets that
  // effect tell the two cases apart.
  const confirmedSuccessfully = useRef(false);

  useEffect(() => {
    if (!photoUri) {
      if (confirmedSuccessfully.current) {
        return;
      }
      // Nothing captured (e.g. deep-linked or refreshed straight into this
      // screen) — send the user back to capture a photo first.
      router.replace('/onboarding/face-capture');
      return;
    }

    let cancelled = false;
    setCompositing(true);
    setError(null);
    compositeToTexture(photoUri)
      .then((uri) => {
        if (!cancelled) {
          setCompositedUri(uri);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not process the photo.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCompositing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [photoUri]);

  async function handleConfirm() {
    if (!compositedUri) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Read back the canonical values from the backend (already saved in
      // the measurements step) rather than threading them through extra
      // client-side state.
      const measurements = await getMeasurements();
      if (!measurements) {
        throw new Error('Missing measurements — please redo the previous step.');
      }
      const { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm } = measurements;

      const bytes = await readUriBytes(compositedUri);
      const { asset_id, upload_url } = await requestUploadUrl('face_texture', 'image/png');
      await uploadToPresignedUrl(upload_url, bytes, 'image/png');

      await putAvatar({
        base_mesh_id: 'procedural-v1',
        // The backend stores this opaquely — we just pass the same 6
        // measurements through so the procedural avatar can be rebuilt
        // identically from them later.
        morph_params: { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm },
        face_texture_asset_id: asset_id,
      });

      confirmedSuccessfully.current = true;
      // The root layout's route guard only checked onboarding status once,
      // right after login — it has no other way to learn onboarding just
      // finished in this same session, so it would otherwise keep routing
      // here instead of `(tabs)`.
      useOnboardingStatusStore.getState().markComplete();
      clearPhoto();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleRetake() {
    clearPhoto();
    router.replace('/onboarding/face-capture');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Review', headerBackVisible: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>Review your photo</Text>
        <Text style={styles.subtitle}>This becomes the face texture on your 3D avatar.</Text>

        <View style={styles.previewWrapper}>
          {compositing ? (
            <ActivityIndicator size="large" />
          ) : compositedUri ? (
            <Image source={{ uri: compositedUri }} style={styles.preview} />
          ) : null}
        </View>

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <Button
          title={saving ? 'Saving...' : 'Looks good, continue'}
          onPress={handleConfirm}
          loading={saving}
          disabled={!compositedUri || compositing}
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
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  preview: {
    width: 220,
    height: 220,
  },
  error: {
    marginBottom: 16,
  },
  retake: {
    marginTop: 12,
    width: '100%',
  },
});

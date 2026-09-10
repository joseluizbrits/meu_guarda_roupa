import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
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

export default function ReviewScreen() {
  const photoUri = useCapturedPhotoStore((state) => state.uri);
  const clearPhoto = useCapturedPhotoStore((state) => state.clear);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const [compositedUri, setCompositedUri] = useState<string | null>(null);
  const [compositing, setCompositing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmedSuccessfully = useRef(false);

  useEffect(() => {
    if (!photoUri) return;
    let cancelled = false;
    setCompositing(true);
    setError(null);
    compositeToTexture(photoUri)
      .then((uri) => { if (!cancelled) setCompositedUri(uri); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not process the photo.'); })
      .finally(() => { if (!cancelled) setCompositing(false); });
    return () => { cancelled = true; };
  }, [photoUri]);

  async function handleConfirm() {
    if (!compositedUri) return;
    setError(null);
    setSaving(true);
    try {
      const measurements = await getMeasurements();
      if (!measurements) throw new Error('Missing measurements — please redo the previous step.');
      const { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm } = measurements;
      const bytes = await readUriBytes(compositedUri);
      const { asset_id, upload_url } = await requestUploadUrl('face_texture', 'image/png');
      await uploadToPresignedUrl(upload_url, bytes, 'image/png');
      await putAvatar({
        base_mesh_id: 'procedural-v1',
        morph_params: { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm },
        face_texture_asset_id: asset_id,
      });
      confirmedSuccessfully.current = true;
      useOnboardingStatusStore.getState().markComplete();
      clearPhoto();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishWithoutPhoto() {
    setError(null);
    setSaving(true);
    try {
      const measurements = await getMeasurements();
      if (!measurements) throw new Error('Missing measurements — please redo the previous step.');
      const { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm } = measurements;
      await putAvatar({
        base_mesh_id: 'procedural-v1',
        morph_params: { height_cm, chest_cm, waist_cm, hip_cm, shoulder_cm, inseam_cm },
        face_texture_asset_id: null,
      });
      confirmedSuccessfully.current = true;
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

  if (!photoUri && !confirmedSuccessfully.current) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review', headerBackVisible: false }} />
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>No face photo yet</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            You can add a face photo later. Finish onboarding to continue.
          </Text>
          {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}
          <Button
            title="Adicionar foto"
            variant="secondary"
            onPress={() => router.replace('/onboarding/face-capture')}
            disabled={saving}
            style={styles.fullWidth}
          />
          <Button
            title={saving ? 'Finalizando...' : 'Finalizar onboarding'}
            onPress={handleFinishWithoutPhoto}
            loading={saving}
            disabled={saving}
            style={styles.fullWidth}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Review', headerBackVisible: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Review your photo</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This becomes the face texture on your 3D avatar.
        </Text>

        <View style={[styles.previewWrapper, { backgroundColor: colors.surfaceMuted }]}>
          {compositing ? (
            <ActivityIndicator size="large" color={colors.primary} />
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
          style={styles.fullWidth}
        />
        <Button
          title="Retake photo"
          variant="secondary"
          onPress={handleRetake}
          disabled={saving}
          style={styles.fullWidth}
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
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
    overflow: 'hidden',
  },
  preview: {
    width: 220,
    height: 220,
  },
  error: {
    marginBottom: spacing.lg,
  },
  fullWidth: {
    width: '100%',
    marginTop: spacing.md,
  },
});

import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useCapturedPhotoStore } from '@/src/features/onboarding/capturedPhotoStore';

export default function FaceCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const setPhoto = useCapturedPhotoStore((state) => state.setPhoto);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) throw new Error('Could not capture photo. Please try again.');
      setPhoto(photo.uri, photo.width, photo.height);
      router.push('/onboarding/review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <>
        <Stack.Screen options={{ title: 'Face photo', headerBackVisible: false }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>Camera access needed</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We use your camera once to capture a face photo for your avatar. It is never shared.
          </Text>
          <Button title="Grant camera access" onPress={requestPermission} />
          <Button
            title="Pular por enquanto"
            variant="ghost"
            onPress={() => {
              useCapturedPhotoStore.getState().clear();
              router.replace('/onboarding/review');
            }}
            style={styles.skipButton}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Face photo', headerBackVisible: false }} />
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front">
          <View style={styles.guideLayer} lightColor="transparent" darkColor="transparent">
            <View style={[styles.guideOval, { borderColor: colors.primary }]} />
            <Text style={styles.guideHint}>Center your face in the oval</Text>
          </View>
        </CameraView>

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <View style={styles.controls}>
          <Button
            title={capturing ? 'Capturing...' : 'Capture'}
            onPress={handleCapture}
            loading={capturing}
          />
          <Button
            title="Pular por enquanto"
            variant="ghost"
            onPress={() => {
              useCapturedPhotoStore.getState().clear();
              router.replace('/onboarding/review');
            }}
            style={styles.skipButton}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  guideLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideOval: {
    width: 240,
    height: 320,
    borderRadius: 160,
    borderWidth: 3,
  },
  guideHint: {
    marginTop: spacing.lg,
    color: '#fff',
    ...typography.body,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  error: {
    marginHorizontal: spacing['2xl'],
    marginTop: spacing.md,
  },
  controls: {
    padding: spacing['2xl'],
  },
  skipButton: {
    marginTop: spacing.md,
  },
});

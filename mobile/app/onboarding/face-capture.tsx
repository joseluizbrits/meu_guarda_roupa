import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useCapturedPhotoStore } from '@/src/features/onboarding/capturedPhotoStore';

/**
 * Onboarding step 2 — captures a front-facing photo for the avatar's face
 * texture. Alignment is manual: the user centers their own face inside the
 * oval guide. We deliberately skip ML Kit face-landmark detection here — a
 * new native dependency for marginal gain over a simple visual guide.
 */
export default function FaceCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const setPhoto = useCapturedPhotoStore((state) => state.setPhoto);

  async function handleCapture() {
    if (!cameraRef.current || capturing) {
      return;
    }
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) {
        throw new Error('Could not capture photo. Please try again.');
      }
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <>
        <Stack.Screen options={{ title: 'Face photo', headerBackVisible: false }} />
        <View style={styles.center}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.subtitle}>
            We use your camera once to capture a face photo for your avatar. It is never shared.
          </Text>
          <Button title="Grant camera access" onPress={requestPermission} />
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
            <View style={styles.guideOval} lightColor="transparent" darkColor="transparent" />
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
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 24,
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
    borderColor: 'rgba(255,255,255,0.85)',
  },
  guideHint: {
    marginTop: 16,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  error: {
    marginHorizontal: 24,
    marginTop: 12,
  },
  controls: {
    padding: 24,
  },
});

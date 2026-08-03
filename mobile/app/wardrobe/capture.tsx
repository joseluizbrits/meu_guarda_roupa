import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Garment capture — a plain full-frame photo of an item the user owns.
 * Unlike `app/onboarding/face-capture.tsx` there's no alignment guide: the
 * whole point is just to get a usable reference photo of the garment.
 */
export default function GarmentCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const setPhoto = useCapturedGarmentPhotoStore((state) => state.setPhoto);

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
      const contentType = CONTENT_TYPE_BY_FORMAT[photo.format] ?? 'image/jpeg';
      setPhoto(photo.uri, photo.width, photo.height, contentType);
      router.push('/wardrobe/tag');
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
        <Stack.Screen options={{ title: 'Add garment' }} />
        <View style={styles.center}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.subtitle}>We use your camera to photograph items for your wardrobe.</Text>
          <Button title="Grant camera access" onPress={requestPermission} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Add garment' }} />
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

        <View style={styles.controls}>
          <Button title={capturing ? 'Capturing...' : 'Capture'} onPress={handleCapture} loading={capturing} />
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
  error: {
    marginHorizontal: 24,
    marginTop: 12,
  },
  controls: {
    padding: 24,
  },
});

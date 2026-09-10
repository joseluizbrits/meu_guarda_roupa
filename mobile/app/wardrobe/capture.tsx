import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { useCapturedGarmentPhotoStore } from '@/src/features/wardrobe/capturedGarmentPhotoStore';

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
};

export default function GarmentCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const setPhoto = useCapturedGarmentPhotoStore((state) => state.setPhoto);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) throw new Error('Could not capture photo. Please try again.');
      const contentType = CONTENT_TYPE_BY_FORMAT[photo.format] ?? 'image/jpeg';
      setPhoto(photo.uri, photo.width, photo.height, contentType);
      router.replace('/wardrobe/select-pieces');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }

  async function handlePickFromGallery() {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType ?? 'image/jpeg';
      setPhoto(asset.uri, asset.width, asset.height, contentType);
      router.replace('/wardrobe/select-pieces');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pick a photo. Please try again.');
    } finally {
      setPicking(false);
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
        <Stack.Screen options={{ title: 'Add garment' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>Camera access needed</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We use your camera to photograph items for your wardrobe.
          </Text>
          <Button title="Grant camera access" onPress={requestPermission} />
          {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}
          <View style={styles.galleryFallback}>
            <Button
              title={picking ? 'Opening gallery...' : 'Choose from gallery instead'}
              variant="secondary"
              onPress={handlePickFromGallery}
              loading={picking}
            />
          </View>
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
        <View style={[styles.controls, { backgroundColor: colors.background }]}>
          <Button title={capturing ? 'Capturing...' : 'Capture'} onPress={handleCapture} loading={capturing} />
          <View style={styles.galleryButton}>
            <Button
              title={picking ? 'Opening gallery...' : 'Choose from gallery'}
              variant="secondary"
              onPress={handlePickFromGallery}
              loading={picking}
              disabled={capturing}
            />
          </View>
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
  error: {
    marginHorizontal: spacing['2xl'],
    marginTop: spacing.md,
  },
  controls: {
    padding: spacing['2xl'],
  },
  galleryButton: {
    marginTop: spacing.md,
  },
  galleryFallback: {
    marginTop: spacing.lg,
    width: '100%',
  },
});

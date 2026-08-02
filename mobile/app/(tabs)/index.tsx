import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { AvatarResponse, getAvatar } from '@/src/core/api/avatar';
import { getMeasurements, MeasurementsResponse } from '@/src/core/api/measurements';
import { Avatar3DView } from '@/src/features/avatar/Avatar3DView';

/**
 * "Fitting Room" tab — the user's 3D avatar, built from their stored
 * measurements. Reachable only once onboarding is complete (see the root
 * layout's `Stack.Protected` guards), so both GETs below are expected to
 * succeed here.
 */
export default function FittingRoomScreen() {
  const [measurements, setMeasurements] = useState<MeasurementsResponse | null>(null);
  const [avatar, setAvatar] = useState<AvatarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getMeasurements(), getAvatar()])
      .then(([measurementsResult, avatarResult]) => {
        if (cancelled) {
          return;
        }
        if (!measurementsResult || !avatarResult) {
          setError('Onboarding data is missing. Please complete onboarding again.');
          return;
        }
        setMeasurements(measurementsResult);
        setAvatar(avatarResult);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your avatar.');
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
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !measurements || !avatar) {
    return (
      <View style={styles.center}>
        <ErrorText>{error ?? 'Could not load your avatar.'}</ErrorText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fitting Room</Text>
      <Text style={styles.hint}>Drag to rotate</Text>
      <View style={styles.viewport}>
        <Avatar3DView
          measurements={{
            height_cm: measurements.height_cm,
            chest_cm: measurements.chest_cm,
            waist_cm: measurements.waist_cm,
            hip_cm: measurements.hip_cm,
            shoulder_cm: measurements.shoulder_cm,
            inseam_cm: measurements.inseam_cm,
          }}
          faceTextureUrl={avatar.face_texture_url}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  viewport: {
    flex: 1,
  },
});

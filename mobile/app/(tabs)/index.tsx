import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { AvatarResponse, getAvatar } from '@/src/core/api/avatar';
import { getMeasurements, MeasurementsResponse } from '@/src/core/api/measurements';
import { listWardrobeItems, WardrobeItemRead } from '@/src/core/api/wardrobe';
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
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItemRead[]>([]);
  const [equippedItem, setEquippedItem] = useState<WardrobeItemRead | null>(null);

  // Refetches on every focus (rather than a store), same reasoning as
  // `closet.tsx` — reflects items added/edited in the closet tab without
  // extra state-management machinery.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWardrobeItems()
        .then((result) => {
          if (!cancelled) {
            setWardrobeItems(result);
          }
        })
        .catch(() => {
          // Best-effort — the try-on picker just stays empty; this
          // shouldn't block the avatar itself from rendering.
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

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

  // Only items with a real segmented cutout can be worn — a raw photo
  // (background and all) stamped on the avatar as a decal would render a
  // visible rectangle, not a garment. `accessory` also stays closet-only
  // (see `garmentPlacement.ts` — no single generalizable body region).
  const wearableItems = wardrobeItems.filter((item) => item.texture_url && item.category !== 'accessory');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fitting Room</Text>
      <Text style={styles.hint}>Drag to rotate</Text>
      <View style={styles.viewport}>
        <Avatar3DView
          key={equippedItem?.id ?? 'none'}
          measurements={{
            height_cm: measurements.height_cm,
            chest_cm: measurements.chest_cm,
            waist_cm: measurements.waist_cm,
            hip_cm: measurements.hip_cm,
            shoulder_cm: measurements.shoulder_cm,
            inseam_cm: measurements.inseam_cm,
          }}
          faceTextureUrl={avatar.face_texture_url}
          equippedGarment={
            equippedItem && equippedItem.texture_url
              ? { category: equippedItem.category, textureUrl: equippedItem.texture_url }
              : null
          }
        />
      </View>

      {wearableItems.length > 0 ? (
        <View style={styles.picker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
            {equippedItem ? (
              <Pressable
                style={[styles.pickerItem, styles.takeOff]}
                onPress={() => setEquippedItem(null)}
                accessibilityRole="button"
                accessibilityLabel="Take off">
                <Text style={styles.takeOffText}>Take off</Text>
              </Pressable>
            ) : null}
            {wearableItems.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.pickerItem, equippedItem?.id === item.id && styles.pickerItemActive]}
                onPress={() => setEquippedItem(item)}
                accessibilityRole="button"
                accessibilityLabel={`Try on ${item.category}`}>
                <Image
                  source={{ uri: item.ai_photo_url ?? item.texture_url! }}
                  style={styles.pickerThumbnail}
                  resizeMode="contain"
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
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
  picker: {
    paddingVertical: 8,
  },
  pickerContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pickerItem: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickerItemActive: {
    borderColor: '#2f95dc',
  },
  pickerThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  takeOff: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  takeOffText: {
    fontSize: 11,
    textAlign: 'center',
  },
});

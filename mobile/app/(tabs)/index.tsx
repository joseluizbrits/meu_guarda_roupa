import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { AvatarResponse, getAvatar } from '@/src/core/api/avatar';
import { getMeasurements, MeasurementsResponse } from '@/src/core/api/measurements';
import { listWardrobeItems, WardrobeCategory, WardrobeItemRead } from '@/src/core/api/wardrobe';
import { Avatar3DView } from '@/src/features/avatar/Avatar3DView';
import { warmTextureCache } from '@/src/features/avatar/avatarTextures';

/**
 * Body region per garment category — the rule that makes multiple garments
 * coexist on the avatar. One slot per region:
 *   - upper: top / outerwear (both cover the torso)
 *   - lower: bottom
 *   - dress: full-body (competes with upper + lower)
 *   - feet:  shoes
 *   - accessory: no body region — closet-only.
 */
const REGION_BY_CATEGORY: Partial<Record<WardrobeCategory, string>> = {
  top: 'upper',
  outerwear: 'upper',
  bottom: 'lower',
  dress: 'dress',
  shoes: 'feet',
};

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
  // One garment per body region, so top + bottom + shoes can be worn at once.
  const [equippedByRegion, setEquippedByRegion] = useState<Record<string, WardrobeItemRead>>({});

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
            // Pre-warm the 3D texture cache with every wearable texture so
            // trying an item on is instant (no fetch when the shell is
            // attached later on). The AI transparent texture wins over the
            // on-device cutout; expo-image disk caches the picker
            // thumbnails separately.
            warmTextureCache(
              result
                .map((item) => item.ai_texture_url ?? item.texture_url)
                .filter((url): url is string => Boolean(url))
            );
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

  // Only items with a real renderable texture can be worn — a raw photo
  // (background and all) stamped on the avatar would render a visible
  // rectangle, not a garment. The AI transparent texture wins over the
  // on-device cutout. `accessory` also stays closet-only (no body region —
  // see `REGION_BY_CATEGORY`).
  const wearableItems = useMemo(
    () =>
      wardrobeItems.filter(
        (item) =>
          (item.ai_texture_url ?? item.texture_url) && item.category !== 'accessory'
      ),
    [wardrobeItems]
  );

  const equippedGarments = useMemo(
    () =>
      Object.values(equippedByRegion)
        .filter(
          (item): item is WardrobeItemRead & { textureUrl: string } =>
            Boolean(item.ai_texture_url ?? item.texture_url)
        )
        .map((item) => ({
          id: item.id,
          category: item.category,
          textureUrl: (item.ai_texture_url ?? item.texture_url) as string,
        })),
    [equippedByRegion]
  );

  const isEquipped = useCallback(
    (item: WardrobeItemRead) => equippedByRegion[REGION_BY_CATEGORY[item.category] ?? '']?.id === item.id,
    [equippedByRegion]
  );

  function toggleItem(item: WardrobeItemRead) {
    const region = REGION_BY_CATEGORY[item.category];
    if (!region) {
      return;
    }
    setEquippedByRegion((prev) => {
      // Tapping the currently-worn garment takes it off.
      if (prev[region]?.id === item.id) {
        const next = { ...prev };
        delete next[region];
        return next;
      }
      // Wearing an item that covers the whole body (dress) drops the torso
      // and leg slots so they don't fight over the same surface.
      const next = { ...prev, [region]: item };
      if (item.category === 'dress') {
        delete next.upper;
        delete next.lower;
      } else if (REGION_BY_CATEGORY[item.category] === 'upper' || REGION_BY_CATEGORY[item.category] === 'lower') {
        // Putting on a top/bottom when a dress is worn removes the dress.
        delete next.dress;
      }
      return next;
    });
  }

  function takeAllOff() {
    setEquippedByRegion({});
  }

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

  const equippedCount = Object.keys(equippedByRegion).length;

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
          equippedGarments={equippedGarments}
        />
      </View>

      {wearableItems.length > 0 ? (
        <View style={styles.picker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
            {equippedCount > 0 ? (
              <Pressable
                style={[styles.pickerItem, styles.takeOff]}
                onPress={takeAllOff}
                accessibilityRole="button"
                accessibilityLabel="Take off all">
                <Text style={styles.takeOffText}>Take off</Text>
              </Pressable>
            ) : null}
            {wearableItems.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.pickerItem, isEquipped(item) && styles.pickerItemActive]}
                onPress={() => toggleItem(item)}
                accessibilityRole="button"
                accessibilityLabel={`Try on ${item.category}`}>
                <Image
                  source={{ uri: item.ai_photo_url ?? item.texture_url! }}
                  style={styles.pickerThumbnail}
                  contentFit="contain"
                  cachePolicy="disk"
                  transition={150}
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

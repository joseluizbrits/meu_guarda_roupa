import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  // The picker shows EVERY non-accessory item — not just the textured ones.
  // A freshly-created piece often has no texture yet (backend AI photo runs
  // as a background job / the on-device cutout failed); hiding it made the
  // picker look like pieces were lost. Items without `ai_texture_url` /
  // `texture_url` render dimmed with a "processando…" badge and only become
  // tappable once a texture arrives (see the polling effect below).
  const pickerItems = useMemo(
    () => wardrobeItems.filter((item) => item.category !== 'accessory'),
    [wardrobeItems]
  );

  const hasPendingTextures = useMemo(
    () => pickerItems.some((item) => !item.ai_texture_url && !item.texture_url),
    [pickerItems]
  );

  // Poll while any item is still missing its wear texture (AI job runs
  // server-side after creation). Stops after ~72s so a permanently-failed
  // item doesn't ping forever.
  const pollCountRef = useRef(0);
  useEffect(() => {
    if (!hasPendingTextures || pollCountRef.current >= 12) {
      return;
    }
    const timer = setTimeout(async () => {
      pollCountRef.current += 1;
      try {
        const result = await listWardrobeItems();
        setWardrobeItems(result);
        warmTextureCache(
          result
            .map((item) => item.ai_texture_url ?? item.texture_url)
            .filter((url): url is string => Boolean(url))
        );
      } catch {
        // Keep current list; next poll or focus will retry.
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [hasPendingTextures, pollCountRef, wardrobeItems]);

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

  const hasTexture = useCallback(
    (item: WardrobeItemRead) => Boolean(item.ai_texture_url ?? item.texture_url),
    []
  );

  function toggleItem(item: WardrobeItemRead) {
    const region = REGION_BY_CATEGORY[item.category];
    if (!region || !hasTexture(item)) {
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

      {pickerItems.length > 0 ? (
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
            {pickerItems.map((item) => {
              const ready = hasTexture(item);
              return (
                <Pressable
                  key={item.id}
                  disabled={!ready}
                  style={[
                    styles.pickerItem,
                    isEquipped(item) && styles.pickerItemActive,
                    !ready && styles.pickerItemPending,
                  ]}
                  onPress={() => toggleItem(item)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !ready }}
                  accessibilityLabel={`Try on ${item.category}`}>
                  <Image
                    source={{ uri: item.ai_photo_url ?? item.texture_url ?? item.photo_url }}
                    style={styles.pickerThumbnail}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={150}
                  />
                  {!ready ? (
                    <View style={styles.pickerBadge}>
                      <Text style={styles.pickerBadgeText}>
                        {item.ai_photo_url ? 'sem corte' : 'processando…'}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
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
  pickerItemPending: {
    opacity: 0.55,
  },
  pickerBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pickerBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
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

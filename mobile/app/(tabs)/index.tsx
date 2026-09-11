import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, shadow, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { AvatarResponse, getAvatar } from '@/src/core/api/avatar';
import { getMeasurements, MeasurementsResponse } from '@/src/core/api/measurements';
import { listWardrobeItems, WardrobeCategory, WardrobeItemRead } from '@/src/core/api/wardrobe';
import { Avatar3DView } from '@/src/features/avatar/Avatar3DView';
import { warmTextureCache } from '@/src/features/avatar/avatarTextures';

const REGION_BY_CATEGORY: Partial<Record<WardrobeCategory, string>> = {
  top: 'upper',
  outerwear: 'upper',
  bottom: 'lower',
  dress: 'dress',
  shoes: 'feet',
};

export default function FittingRoomScreen() {
  const [measurements, setMeasurements] = useState<MeasurementsResponse | null>(null);
  const [avatar, setAvatar] = useState<AvatarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItemRead[]>([]);
  const [equippedByRegion, setEquippedByRegion] = useState<Record<string, WardrobeItemRead>>({});
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWardrobeItems()
        .then((result) => {
          if (!cancelled) {
            setWardrobeItems(result);
            warmTextureCache(
              result
                .map((item) => item.ai_texture_url ?? item.texture_url)
                .filter((url): url is string => Boolean(url))
            );
          }
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getMeasurements(), getAvatar()])
      .then(([measurementsResult, avatarResult]) => {
        if (cancelled) return;
        if (!measurementsResult || !avatarResult) {
          setError('Onboarding data is missing. Please complete onboarding again.');
          return;
        }
        setMeasurements(measurementsResult);
        setAvatar(avatarResult);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your avatar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const pickerItems = useMemo(
    () => wardrobeItems.filter((item) => item.category !== 'accessory'),
    [wardrobeItems]
  );

  const hasPendingTextures = useMemo(
    () => pickerItems.some((item) => !item.ai_texture_url && !item.texture_url),
    [pickerItems]
  );

  const pollCountRef = useRef(0);
  useEffect(() => {
    if (!hasPendingTextures || pollCountRef.current >= 12) return;
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
      } catch {}
    }, 6000);
    return () => clearTimeout(timer);
  }, [hasPendingTextures, pollCountRef, wardrobeItems]);

  const equippedGarments = useMemo(
    () =>
      Object.values(equippedByRegion)
        .filter((item): item is WardrobeItemRead & { textureUrl: string } =>
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
    if (!region || !hasTexture(item)) return;
    setEquippedByRegion((prev) => {
      if (prev[region]?.id === item.id) {
        const next = { ...prev };
        delete next[region];
        return next;
      }
      const next = { ...prev, [region]: item };
      if (item.category === 'dress') {
        delete next.upper;
        delete next.lower;
      } else if (REGION_BY_CATEGORY[item.category] === 'upper' || REGION_BY_CATEGORY[item.category] === 'lower') {
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
        <ActivityIndicator size="large" color={colors.primary} />
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
      <Text style={[styles.title, { color: colors.text }]}>Fitting Room</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Drag to rotate</Text>
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
        <View style={[styles.picker, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerContent}>
            {equippedCount > 0 ? (
              <Pressable
                style={[styles.pickerItem, styles.takeOff, { backgroundColor: colors.surfaceMuted }]}
                onPress={takeAllOff}
                accessibilityRole="button"
                accessibilityLabel="Take off all">
                <Text style={[styles.takeOffText, { color: colors.textSecondary }]}>Take off</Text>
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
                    isEquipped(item) && [styles.pickerItemActive, { borderColor: colors.primary }],
                    !ready && styles.pickerItemPending,
                  ]}
                  onPress={() => toggleItem(item)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !ready }}
                  accessibilityLabel={`Try on ${item.category}`}>
                  <Image
                    source={{ uri: item.ai_photo_url ?? item.texture_url ?? item.photo_url }}
                    style={[styles.pickerThumbnail, { backgroundColor: colors.surfaceMuted }]}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={150}
                  />
                  {!ready ? (
                    <View style={[styles.pickerBadge, { backgroundColor: colors.surfaceElevated }]}>
                      <Text style={[styles.pickerBadgeText, { color: colors.text }]}>
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
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  hint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  viewport: {
    flex: 1,
  },
  picker: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  pickerContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  pickerItem: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickerItemActive: {
    borderWidth: 2.5,
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
  },
  pickerBadgeText: {
    ...typography.caption,
    fontSize: 9,
    textAlign: 'center',
  },
  pickerThumbnail: {
    width: '100%',
    height: '100%',
  },
  takeOff: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeOffText: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
});

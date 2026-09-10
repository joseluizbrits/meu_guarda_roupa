import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, shadow, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { deleteWardrobeItem, listWardrobeItems, WardrobeCategory, WardrobeItemRead } from '@/src/core/api/wardrobe';

const IDEAL_CELL_WIDTH = 130;
const MIN_COLUMNS = 2;
const GRID_GAP = spacing.sm;

export default function ClosetScreen() {
  const [items, setItems] = useState<WardrobeItemRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WardrobeCategory | null>(null);
  const { width } = useWindowDimensions();
  const numColumns = Math.max(MIN_COLUMNS, Math.floor(width / IDEAL_CELL_WIDTH));
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      listWardrobeItems()
        .then((result) => {
          if (!cancelled) setItems(result);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your wardrobe.');
        });
      return () => { cancelled = true; };
    }, [])
  );

  const filteredItems = useMemo(() => {
    if (!items) return items;
    return filter ? items.filter((item) => item.category === filter) : items;
  }, [items, filter]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setConfirmingDelete(false);
    setDeleteError(null);
  }

  async function handleDeleteSelected() {
    setDeleteError(null);
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteWardrobeItem(id)));
    const succeededIds = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
    if (succeededIds.size > 0) {
      setItems((current) => (current ? current.filter((item) => !succeededIds.has(item.id)) : current));
    }
    setDeleting(false);
    const failedCount = ids.length - succeededIds.size;
    if (failedCount > 0) {
      setDeleteError(
        failedCount === ids.length
          ? 'Could not delete the selected items.'
          : `Deleted ${succeededIds.size} of ${ids.length} — some failed.`
      );
      setConfirmingDelete(false);
      setSelectedIds(new Set());
    } else {
      clearSelection();
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <ErrorText>{error}</ErrorText>
      </View>
    );
  }

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Your closet is empty</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Photograph an item you own to add it here.
        </Text>
        <Button title="Add your first item" onPress={() => router.push('/wardrobe/capture')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={[styles.selectionCount, { color: colors.text }]}>
            {selectedIds.size} selected
          </Text>
          {confirmingDelete ? (
            <View style={styles.selectionActions}>
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} disabled={deleting} />
              <Button
                title={deleting ? 'Deleting...' : 'Confirm delete'}
                variant="danger"
                onPress={handleDeleteSelected}
                loading={deleting}
              />
            </View>
          ) : (
            <View style={styles.selectionActions}>
              <Button title="Cancel" variant="secondary" onPress={clearSelection} />
              <Button title="Delete" variant="danger" onPress={() => setConfirmingDelete(true)} />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.filterBar}>
          <CategoryPicker value={filter} onChange={setFilter} allowAll />
        </View>
      )}
      {deleteError ? <ErrorText style={styles.deleteError}>{deleteError}</ErrorText> : null}

      {filteredItems && filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            No items in this category.
          </Text>
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={filteredItems ?? []}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <Pressable
                style={[styles.cell, { width: `${100 / numColumns}%` }]}
                onPress={() => (selectionMode ? toggleSelected(item.id) : router.push(`/wardrobe/${item.id}`))}
                onLongPress={() => toggleSelected(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${item.category} item`}>
                <Image
                  source={{ uri: item.ai_photo_url ?? item.texture_url ?? item.photo_url }}
                  style={[styles.thumbnail, { backgroundColor: colors.surfaceMuted }]}
                  contentFit="cover"
                  cachePolicy="disk"
                  transition={150}
                />
                {selected ? (
                  <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.checkBadgeText}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  filterBar: {
    paddingHorizontal: GRID_GAP * 2,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_GAP * 2,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  selectionCount: {
    ...typography.label,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteError: {
    marginHorizontal: GRID_GAP * 2,
    marginTop: spacing.sm,
  },
  gridContent: {
    padding: GRID_GAP / 2,
  },
  cell: {
    padding: GRID_GAP / 2,
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: GRID_GAP / 2 + 6,
    right: GRID_GAP / 2 + 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
  },
});

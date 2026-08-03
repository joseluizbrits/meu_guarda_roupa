import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { deleteWardrobeItem, listWardrobeItems, WardrobeCategory, WardrobeItemRead } from '@/src/core/api/wardrobe';

// Target cell width, not a fixed column count — a fixed count (e.g. always
// 3 columns) looks fine on a phone but produces huge tiles on a wider
// browser window (each column just stretches to fill the extra space).
// Deriving the column count from the viewport keeps cells roughly this
// size regardless of screen width.
const IDEAL_CELL_WIDTH = 130;
const MIN_COLUMNS = 2;
const GRID_GAP = 8;

/**
 * "Closet" tab — a grid of the user's photographed garments, filterable by
 * category. Refetches on every focus (rather than a store) so it always
 * reflects items added/edited/deleted by the capture and detail flows
 * without extra state-management machinery.
 */
export default function ClosetScreen() {
  const [items, setItems] = useState<WardrobeItemRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WardrobeCategory | null>(null);
  const { width } = useWindowDimensions();
  const numColumns = Math.max(MIN_COLUMNS, Math.floor(width / IDEAL_CELL_WIDTH));
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

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
          if (!cancelled) {
            setItems(result);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Could not load your wardrobe.');
          }
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const filteredItems = useMemo(() => {
    if (!items) {
      return items;
    }
    return filter ? items.filter((item) => item.category === filter) : items;
  }, [items, filter]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
    // Only drop the ones that actually succeeded — a partial failure must
    // not make a still-existing item disappear from the list.
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Your closet is empty</Text>
        <Text style={styles.emptySubtitle}>Photograph an item you own to add it here.</Text>
        <Button title="Add your first item" onPress={() => router.push('/wardrobe/capture')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          {confirmingDelete ? (
            <View style={styles.selectionActions}>
              <Button title="Cancel" onPress={() => setConfirmingDelete(false)} disabled={deleting} />
              <Button
                title={deleting ? 'Deleting...' : 'Confirm delete'}
                onPress={handleDeleteSelected}
                loading={deleting}
              />
            </View>
          ) : (
            <View style={styles.selectionActions}>
              <Button title="Cancel" onPress={clearSelection} />
              <Button title="Delete" onPress={() => setConfirmingDelete(true)} />
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
          <Text style={styles.emptySubtitle}>No items in this category.</Text>
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
                  style={[styles.thumbnail, selected && { borderColor: tint, borderWidth: 3 }]}
                  resizeMode="contain"
                />
                {selected ? (
                  <View style={[styles.checkBadge, { backgroundColor: tint }]} lightColor={tint} darkColor={tint}>
                    <Text style={styles.checkBadgeText} lightColor="#fff" darkColor="#fff">
                      ✓
                    </Text>
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
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 24,
    textAlign: 'center',
  },
  filterBar: {
    paddingHorizontal: GRID_GAP * 2,
    paddingTop: 12,
    paddingBottom: 4,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_GAP * 2,
    paddingTop: 12,
    paddingBottom: 4,
  },
  selectionCount: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteError: {
    marginHorizontal: GRID_GAP * 2,
    marginTop: 8,
  },
  gridContent: {
    padding: GRID_GAP / 2,
  },
  cell: {
    // Percentage width + inner padding (rather than `flex` + a row gap)
    // keeps each row exactly the container's width — no risk of the last
    // column overflowing.
    padding: GRID_GAP / 2,
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: GRID_GAP / 2 + 6,
    right: GRID_GAP / 2 + 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});

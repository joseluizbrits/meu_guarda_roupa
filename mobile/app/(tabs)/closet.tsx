import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { CategoryPicker } from '@/src/components/molecules/CategoryPicker';
import { listWardrobeItems, WardrobeCategory, WardrobeItemRead } from '@/src/core/api/wardrobe';

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
      <View style={styles.filterBar}>
        <CategoryPicker value={filter} onChange={setFilter} allowAll />
      </View>

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
          renderItem={({ item }) => (
            <Pressable
              style={[styles.cell, { width: `${100 / numColumns}%` }]}
              onPress={() => router.push(`/wardrobe/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.category} item`}>
              <Image
                source={{ uri: item.texture_url ?? item.photo_url }}
                style={styles.thumbnail}
                resizeMode="contain"
              />
            </Pressable>
          )}
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
  gridContent: {
    padding: GRID_GAP / 2,
  },
  cell: {
    // Percentage width + inner padding (rather than `flex` + a row gap)
    // keeps each row exactly the container's width — no risk of the last
    // column overflowing.
    padding: GRID_GAP / 2,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});

import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { listWardrobeItems, WardrobeItemRead } from '@/src/core/api/wardrobe';

const NUM_COLUMNS = 3;
const GRID_GAP = 8;

/**
 * "Closet" tab — a grid of the user's photographed garments. Refetches on
 * every focus (rather than a store) so it always reflects items added/edited/
 * deleted by the capture and detail flows without extra state-management
 * machinery.
 */
export default function ClosetScreen() {
  const [items, setItems] = useState<WardrobeItemRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.cell}
            onPress={() => router.push(`/wardrobe/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.category} item`}>
            <Image source={{ uri: item.photo_url }} style={styles.thumbnail} />
          </Pressable>
        )}
      />
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
  gridContent: {
    padding: GRID_GAP / 2,
  },
  cell: {
    // Percentage width + inner padding (rather than `flex` + a row gap)
    // keeps each row exactly the container's width — no risk of the last
    // column overflowing.
    width: `${100 / NUM_COLUMNS}%`,
    padding: GRID_GAP / 2,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});

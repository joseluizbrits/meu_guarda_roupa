import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { WardrobeCategory } from '@/src/core/api/wardrobe';

const CATEGORIES: { value: WardrobeCategory; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'dress', label: 'Dress' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'accessory', label: 'Accessory' },
];

type CategoryPickerProps = {
  value: WardrobeCategory | null;
  onChange: (category: WardrobeCategory | null) => void;
  disabled?: boolean;
  /**
   * Prepends an "All" chip mapped to `null` — for filtering (the closet
   * grid), where "show everything" is a valid state, unlike tagging a new
   * item (`app/wardrobe/tag.tsx`), which always needs one real category.
   */
  allowAll?: boolean;
};

/** A row of selectable chips for the 6 wardrobe-item categories. Dumb — the caller owns the selected value. */
export function CategoryPicker({ value, onChange, disabled, allowAll }: CategoryPickerProps) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const options = allowAll ? [{ value: null, label: 'All' }, ...CATEGORIES] : CATEGORIES;

  return (
    <View style={styles.wrap} lightColor="transparent" darkColor="transparent">
      {options.map((category) => {
        const selected = category.value === value;
        return (
          <Pressable
            key={category.value ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(category.value)}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: tint,
                backgroundColor: selected ? tint : 'transparent',
                opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}>
            <Text style={[styles.label, { color: selected ? '#fff' : tint }]}>{category.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});

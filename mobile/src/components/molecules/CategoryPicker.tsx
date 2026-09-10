import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, shadow, spacing, typography } from '@/constants/Theme';
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
  const colors = Colors[colorScheme];
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
              selected
                ? [styles.chipSelected, { backgroundColor: colors.primary }]
                : [styles.chipDefault, { borderColor: colors.border, backgroundColor: colors.surface }],
              pressed && styles.chipPressed,
              disabled && styles.chipDisabled,
            ]}>
            <Text
              style={[
                styles.label,
                selected
                  ? { color: '#FFFFFF' }
                  : { color: colors.textSecondary },
              ]}>
              {category.label}
            </Text>
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
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipDefault: {
    borderWidth: 1.5,
  },
  chipSelected: {
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadow.sm,
  },
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  chipDisabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.label,
  },
});

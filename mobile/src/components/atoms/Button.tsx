import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text, ViewStyle } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, shadow, spacing, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
};

export function Button({ title, loading, disabled, variant = 'primary', style, ...pressableProps }: ButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;

  const variantStyles = getVariantStyles(colors, variant);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...pressableProps}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        shadow.sm,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variantStyles.loadingColor} size="small" />
      ) : (
        <Text style={[styles.text, variantStyles.text]}>{title}</Text>
      )}
    </Pressable>
  );
}

function getVariantStyles(colors: typeof Colors.light, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: colors.primary },
        text: { color: '#FFFFFF' },
        loadingColor: '#FFFFFF',
      };
    case 'secondary':
      return {
        container: {
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        text: { color: colors.text },
        loadingColor: colors.primary,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.primary,
        },
        text: { color: colors.primary },
        loadingColor: colors.primary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' },
        text: { color: colors.primary },
        loadingColor: colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.error },
        text: { color: '#FFFFFF' },
        loadingColor: '#FFFFFF',
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    ...typography.button,
  },
});

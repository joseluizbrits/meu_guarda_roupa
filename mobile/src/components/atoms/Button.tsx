import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  loading?: boolean;
};

export function Button({ title, loading, disabled, ...pressableProps }: ButtonProps) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...pressableProps}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tint, opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

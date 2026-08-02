import { forwardRef } from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';

export const Input = forwardRef<TextInput, TextInputProps>(function Input(props, ref) {
  const colorScheme = useColorScheme();
  const color = useThemeColor({}, 'text');
  const borderColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
  const placeholderTextColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor}
      {...props}
      style={[styles.input, { color, borderColor }, props.style]}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});

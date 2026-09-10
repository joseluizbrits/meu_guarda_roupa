import { StyleSheet } from 'react-native';

import { Text, TextProps } from '@/components/Themed';
import { typography } from '@/constants/Theme';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export function ErrorText({ style, ...props }: TextProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return <Text {...props} style={[styles.text, { color: colors.error }, style]} />;
}

const styles = StyleSheet.create({
  text: {
    ...typography.body,
    textAlign: 'center',
  },
});

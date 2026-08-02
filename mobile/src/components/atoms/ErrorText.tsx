import { StyleSheet } from 'react-native';

import { Text, TextProps } from '@/components/Themed';

export function ErrorText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}

const styles = StyleSheet.create({
  text: {
    color: '#d0342c',
    fontSize: 14,
    textAlign: 'center',
  },
});

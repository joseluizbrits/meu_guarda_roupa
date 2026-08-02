import { StyleSheet, TextInputProps } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Input } from '@/src/components/atoms/Input';

type FormFieldProps = TextInputProps & {
  label: string;
};

export function FormField({ label, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Input {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
});

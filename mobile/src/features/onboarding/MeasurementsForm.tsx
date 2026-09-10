import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, typography } from '@/constants/Theme';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { FormField } from '@/src/components/molecules/FormField';
import { Measurements, putMeasurements } from '@/src/core/api/measurements';

type FieldKey = keyof Measurements;

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'height_cm', label: 'Height (cm)' },
  { key: 'chest_cm', label: 'Chest (cm)' },
  { key: 'waist_cm', label: 'Waist (cm)' },
  { key: 'hip_cm', label: 'Hip (cm)' },
  { key: 'shoulder_cm', label: 'Shoulder (cm)' },
  { key: 'inseam_cm', label: 'Inseam (cm)' },
];

type FormValues = Record<FieldKey, string>;

const DEFAULT_VALUES: FormValues = {
  height_cm: '170',
  chest_cm: '90',
  waist_cm: '75',
  hip_cm: '95',
  shoulder_cm: '45',
  inseam_cm: '80',
};

function parseMeasurements(values: FormValues): Measurements | null {
  const parsed = {} as Measurements;
  for (const { key } of FIELDS) {
    const value = Number(values[key].replace(',', '.'));
    if (!values[key] || !Number.isFinite(value) || value <= 0) return null;
    parsed[key] = value;
  }
  return parsed;
}

export function MeasurementsForm() {
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const measurements = parseMeasurements(values);

  function setField(key: FieldKey, text: string) {
    setValues((prev) => ({ ...prev, [key]: text }));
  }

  async function handleSubmit() {
    if (!measurements) return;
    setError(null);
    setSubmitting(true);
    try {
      await putMeasurements(measurements);
      router.push('/onboarding/face-capture');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.primary }]}>Your measurements</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Used to size your avatar and recommend fits. All values in centimeters.
      </Text>

      {FIELDS.map(({ key, label }) => (
        <FormField
          key={key}
          label={label}
          value={values[key]}
          onChangeText={(text) => setField(key, text)}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      ))}

      {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

      <Button
        title={submitting ? 'Saving...' : 'Continue'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!measurements}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing['2xl'],
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  error: {
    marginBottom: spacing.lg,
  },
});

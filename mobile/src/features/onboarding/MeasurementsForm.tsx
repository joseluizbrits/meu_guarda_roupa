import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

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

// Pre-filled with the same adult-average reference values the procedural
// avatar is scaled against (see REFERENCE_MEASUREMENTS in proceduralBody.ts)
// — the 3D model doesn't need to be body-accurate yet, the current focus is
// showing how garments combine, so defaults let testers skip past this step
// instead of typing 6 numbers. Still editable/required like before.
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
    if (!values[key] || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    parsed[key] = value;
  }
  return parsed;
}

/**
 * Onboarding step 1 — collects the 6 body measurements (cm) and upserts them
 * via `PUT /users/me/measurements`. Safe to submit repeatedly (backend
 * upserts), so a user revisiting this step just overwrites their values.
 */
export function MeasurementsForm() {
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const measurements = parseMeasurements(values);

  function setField(key: FieldKey, text: string) {
    setValues((prev) => ({ ...prev, [key]: text }));
  }

  async function handleSubmit() {
    if (!measurements) {
      return;
    }
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
      <Text style={styles.title}>Your measurements</Text>
      <Text style={styles.subtitle}>
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
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 24,
    textAlign: 'center',
  },
  error: {
    marginBottom: 16,
  },
});

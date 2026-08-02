import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { MeasurementsForm } from '@/src/features/onboarding/MeasurementsForm';

export default function MeasurementsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Measurements', headerBackVisible: false }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.flex} keyboardShouldPersistTaps="handled">
          <MeasurementsForm />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flexGrow: 1,
  },
});

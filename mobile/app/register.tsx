import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Link, Stack, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/src/components/atoms/Button';
import { ErrorText } from '@/src/components/atoms/ErrorText';
import { FormField } from '@/src/components/molecules/FormField';
import { useAuthStore } from '@/src/core/auth/authStore';

export default function RegisterScreen() {
  const register = useAuthStore((state) => state.register);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await register(email.trim(), password, fullName.trim());
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Text style={styles.title}>Create your account</Text>

          <FormField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholder="Jane Doe"
          />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            placeholder="••••••••"
          />

          {error ? <ErrorText style={styles.error}>{error}</ErrorText> : null}

          <Button
            title={submitting ? 'Creating account...' : 'Sign up'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!email || !password || !fullName}
          />

          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  error: {
    marginBottom: 16,
  },
  link: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    textAlign: 'center',
    color: '#2e78b7',
  },
});

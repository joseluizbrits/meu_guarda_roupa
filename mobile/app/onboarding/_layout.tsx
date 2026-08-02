import { Stack } from 'expo-router';

export const unstable_settings = {
  // Without this, file-based routing would default to whichever onboarding
  // screen sorts first alphabetically (`face-capture`) instead of the
  // actual first step.
  initialRouteName: 'measurements',
};

// Each screen declares its own header via an inline `<Stack.Screen options={...} />`
// (same pattern as `login.tsx`/`register.tsx`), so this layout stays a bare Stack.
export default function OnboardingLayout() {
  return <Stack />;
}

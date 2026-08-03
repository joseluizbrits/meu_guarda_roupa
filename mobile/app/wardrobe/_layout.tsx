import { Stack } from 'expo-router';

export const unstable_settings = {
  // Without this, file-based routing would default to whichever screen
  // sorts first alphabetically (`[id]`) instead of the actual entry point,
  // reached via the closet tab's "add" button.
  initialRouteName: 'capture',
};

// Each screen declares its own header via an inline `<Stack.Screen options={...} />`
// (same pattern as `app/onboarding/_layout.tsx`), so this layout stays a bare Stack.
export default function WardrobeLayout() {
  return <Stack />;
}

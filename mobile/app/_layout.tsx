import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/src/core/auth/authStore';
import { useOnboardingStatusStore } from '@/src/features/onboarding/onboardingStatusStore';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const hydrate = useAuthStore((state) => state.hydrate);
  // Extends the auth gate below: once authenticated, also wait to learn
  // whether the user still needs to go through onboarding. The onboarding
  // flow itself calls `markComplete()` directly when it finishes, so this
  // doesn't need to re-run on anything other than login/logout.
  const onboardingStatus = useOnboardingStatusStore((state) => state.status);
  const checkOnboarding = useOnboardingStatusStore((state) => state.check);
  const resetOnboarding = useOnboardingStatusStore((state) => state.reset);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isAuthenticated) {
      checkOnboarding();
    } else {
      resetOnboarding();
    }
  }, [isAuthenticated, checkOnboarding, resetOnboarding]);

  const waitingOnOnboardingCheck = isAuthenticated && onboardingStatus === 'unknown';

  if (isLoading || waitingOnOnboardingCheck) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </ThemeProvider>
    );
  }

  const isOnboarded = isAuthenticated && onboardingStatus === 'complete';
  const needsOnboarding = isAuthenticated && onboardingStatus === 'incomplete';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={isOnboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="wardrobe" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

// Design system tokens — spacing, radius, shadow, typography
// Import from here for consistent styling across the app.

import { Platform, TextStyle, ViewStyle } from 'react-native';

// ── Spacing (4px base) ──────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

// ── Border Radius ───────────────────────────────────────────
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 9999,
} as const;

// ── Shadows (warm-tinted, not pure black) ───────────────────
// Platform-specific: iOS uses shadow* props, Android uses elevation.
type ShadowTokens = {
  sm: ViewStyle;
  md: ViewStyle;
  lg: ViewStyle;
  xl: ViewStyle;
};

const iosShadows: ShadowTokens = {
  sm: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  md: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  lg: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  xl: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
};

const androidShadows: ShadowTokens = {
  sm: { elevation: 2 },
  md: { elevation: 4 },
  lg: { elevation: 8 },
  xl: { elevation: 12 },
};

export const shadow: ShadowTokens = Platform.select({
  ios: iosShadows,
  android: androidShadows,
  default: iosShadows,
})!;

// ── Typography ──────────────────────────────────────────────
// Poppins loaded via useFonts in _layout.tsx
// Font family names match the keys passed to useFonts.
const poppins = Platform.select({
  ios: 'Poppins',
  android: 'Poppins',
  web: 'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: 'Poppins',
});
const poppinsMedium = Platform.select({
  ios: 'Poppins-Medium',
  android: 'Poppins-Medium',
  web: 'Poppins-Medium, Poppins, sans-serif',
  default: 'Poppins-Medium',
});
const poppinsSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins-SemiBold',
  web: 'Poppins-SemiBold, Poppins, sans-serif',
  default: 'Poppins-SemiBold',
});
const poppinsBold = Platform.select({
  ios: 'Poppins-Bold',
  android: 'Poppins-Bold',
  web: 'Poppins-Bold, Poppins, sans-serif',
  default: 'Poppins-Bold',
});

export const typography = {
  fontFamily: poppins,

  // Display / Hero
  h1: {
    fontFamily: poppinsBold,
    fontSize: 32,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 40,
    letterSpacing: -0.5,
  },

  // Section title
  h2: {
    fontFamily: poppinsBold,
    fontSize: 24,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 32,
    letterSpacing: -0.3,
  },

  // Card title
  h3: {
    fontFamily: poppinsSemiBold,
    fontSize: 18,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 26,
  },

  // Body large
  bodyLg: {
    fontFamily: poppins,
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  },

  // Body
  body: {
    fontFamily: poppins,
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
  },

  // Caption
  caption: {
    fontFamily: poppinsMedium,
    fontSize: 12,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 16,
  },

  // Button label
  button: {
    fontFamily: poppinsSemiBold,
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 24,
  },

  // Small label
  label: {
    fontFamily: poppinsSemiBold,
    fontSize: 13,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 18,
  },
} as const;

// ── Convenience: shared screen containers ───────────────────
export const layouts = {
  screen: {
    flex: 1,
  } as ViewStyle,

  screenPadded: {
    flex: 1,
    padding: spacing['2xl'],
  } as ViewStyle,

  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  } as ViewStyle,

  centeredPadded: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing['2xl'],
  } as ViewStyle,
} as const;

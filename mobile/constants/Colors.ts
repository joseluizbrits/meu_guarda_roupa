// Design tokens — Modern Vibrante palette
// Single source of truth for all colors in the app.

const primaryLight = '#E8467C'; // Rose/magenta — vibrant, fashion-forward
const primaryDark = '#F06292'; // Lighter rose for dark mode contrast

const secondaryLight = '#FF7A5C'; // Coral — energetic complement
const secondaryDark = '#FF8A75';

const accentLight = '#7C4DFF'; // Electric purple — highlights
const accentDark = '#B388FF';

const successLight = '#00C853';
const successDark = '#69F0AE';

const warningLight = '#FF9100';
const warningDark = '#FFD740';

const errorLight = '#FF1744';
const errorDark = '#FF5252';

export default {
  light: {
    // Core
    primary: primaryLight,
    secondary: secondaryLight,
    accent: accentLight,

    // Semantic
    success: successLight,
    warning: warningLight,
    error: errorLight,

    // Surfaces
    background: '#FAF8F6', // Warm off-white
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#F5F3F1', // Slightly darker warm gray

    // Borders
    border: '#E8E4E1',
    borderFocused: primaryLight,

    // Text
    text: '#1A1A2E', // Deep charcoal, not pure black
    textSecondary: '#6B6B80',
    textMuted: '#9E9EB0',
    textInverse: '#FFFFFF',

    // Tab bar
    tabIconDefault: '#B0B0C0',
    tabIconSelected: primaryLight,

    // Tint (kept for backward compat)
    tint: primaryLight,

    // Gradient start/end for primary buttons
    gradientStart: '#E8467C',
    gradientEnd: '#FF6B8A',
  },
  dark: {
    // Core
    primary: primaryDark,
    secondary: secondaryDark,
    accent: accentDark,

    // Semantic
    success: successDark,
    warning: warningDark,
    error: errorDark,

    // Surfaces
    background: '#0F0F1A', // Deep charcoal with blue undertone
    surface: '#1A1A2E',
    surfaceElevated: '#242440',
    surfaceMuted: '#16162B',

    // Borders
    border: '#2A2A45',
    borderFocused: primaryDark,

    // Text
    text: '#F0EFF4', // Warm off-white
    textSecondary: '#A0A0B8',
    textMuted: '#6B6B85',
    textInverse: '#1A1A2E',

    // Tab bar
    tabIconDefault: '#5A5A75',
    tabIconSelected: primaryDark,

    // Tint (kept for backward compat)
    tint: primaryDark,

    // Gradient start/end for primary buttons
    gradientStart: '#E8467C',
    gradientEnd: '#FF6B8A',
  },
};

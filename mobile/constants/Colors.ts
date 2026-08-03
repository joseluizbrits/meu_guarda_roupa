const tintColorLight = '#2f95dc';
// Not '#fff': `tint` also doubles as a solid fill color (Button's
// background, CategoryPicker's selected chip), both with white text/icons
// on top — white-on-white in dark mode. Same blue as light mode keeps
// contrast in both places.
const tintColorDark = tintColorLight;

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};

// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `GLTFLoader` (see `Avatar3DView.tsx`) loads `assets/models/BaseHuman.glb`
// via a `require(...)` + `expo-asset` `Asset.fromModule(...)`. Metro's
// default `assetExts` doesn't include 3D model formats, so without this
// they'd be treated as source files and fail to bundle/resolve as assets.
config.resolver.assetExts.push('glb', 'gltf', 'bin');

// Same reasoning for `.tflite` — `tfliteSegmentationEngine.ts` loads
// `assets/models/u2net_full_integer_quant.tflite` the same
// `Asset.fromModule(...)` way. `react-native-fast-tflite`'s own docs call
// this out explicitly (it lets the model be swapped at runtime without a
// rebuild); this project just needs it registered as a bundleable asset.
config.resolver.assetExts.push('tflite');

module.exports = config;

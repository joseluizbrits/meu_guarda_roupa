// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `GLTFLoader` (see `Avatar3DView.tsx`) loads `assets/models/BaseHuman.glb`
// via a `require(...)` + `expo-asset` `Asset.fromModule(...)`. Metro's
// default `assetExts` doesn't include 3D model formats, so without this
// they'd be treated as source files and fail to bundle/resolve as assets.
config.resolver.assetExts.push('glb', 'gltf', 'bin');

module.exports = config;

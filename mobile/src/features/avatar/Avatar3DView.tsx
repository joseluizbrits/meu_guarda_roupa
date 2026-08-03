import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';
import { bindPosePosition, findSkinnedMesh } from './bindPose';
import { createDecal } from './decal';
import { readUriBytes } from './faceTexture/readUriBytes';
import { attachGarmentDecal } from './garmentPlacement';

// Radians of Y-axis rotation per pixel of horizontal drag. Free-spin (no
// clamping) — simplest behavior and fine for an MVP turntable view.
const ROTATE_SPEED = 0.012;
const CAMERA_FOV_DEGREES = 45;
// Extra headroom above/below the avatar so it doesn't touch the frame edges.
const CAMERA_FRAMING_MARGIN = 1.35;

// The rig's authored bind pose is closer to a T-pose than a natural stance
// (arms extend outward and only slope down ~25-30 degrees) — looks broken
// for a "look at your outfit" view. This angle was derived from the GLB's
// own bind-pose joint matrices (each arm bone's local Z/"roll" axis is
// aligned with world Z, so rotating around it swings the bone within the
// body's width/height plane) and tuned against a render — rotating each
// upper arm by 58 degrees rests the hand beside the outer thigh with no
// clipping into the body, checked from the front, side, and back. A
// previous attempt used 64 degrees plus an extra forearm-only rotation for
// an elbow bend; both together overshot and crossed the hands in front of
// the groin (visibly wrong from the front), so the elbow bend was dropped
// entirely rather than just shrunk further — the upper-arm rotation alone
// already reads as a natural relaxed pose. `_L`/`_R` bones are mirrored,
// hence opposite signs.
const UPPER_ARM_DROP_RADIANS = THREE.MathUtils.degToRad(58);

// Face decal placement. Offset from the `head` bone's real bind-pose
// position (see `bindPose.ts` — the bone object's own live transform can't
// be used directly), derived from the GLB's own bind-pose data, not
// guessed: the head bone's origin sits near the jaw, and +Z already points
// toward the front of the face (same forward convention as the rest of the
// rig — confirmed independently via the feet: the toes bones sit at a
// higher bind-pose Z than the feet they're attached to). These offsets
// center the decal roughly over the nose/eye area, just in front of the
// sculpted face surface.
const FACE_DECAL_SIZE = 0.17;
const FACE_DECAL_OFFSET_Y = 0.02;
const FACE_DECAL_OFFSET_Z = 0.13;

type AvatarMeasurements = {
  height_cm: number;
  chest_cm: number;
  waist_cm: number;
  hip_cm: number;
  shoulder_cm: number;
  inseam_cm: number;
};

type Avatar3DViewProps = {
  // Accepted for future phases (e.g. fitting garments to body shape), but
  // deliberately NOT applied to the loaded mesh in this pass — the rig has
  // no morph targets, and bone-scaling a skinned mesh to match 6
  // measurement inputs well is a separate, harder problem than getting the
  // real mesh rendering. The model loads at its authored scale.
  measurements: AvatarMeasurements;
  faceTextureUrl?: string | null;
  // The wardrobe item currently "tried on", if any — rendered as a decal on
  // the body region matching its category (see `garmentPlacement.ts`).
  equippedGarment?: { category: WardrobeCategory; textureUrl: string } | null;
};

/**
 * Loads a remote image URL into a `THREE.Texture`. Used for both the face
 * texture and garment textures — neither is treated specially here.
 *
 * - Web: runs in an actual browser (react-native-web), so plain
 *   `THREE.TextureLoader` works as-is — no Expo asset resolution needed.
 * - Native: there's no DOM/`Image` global, so `THREE.TextureLoader` can't
 *   load a remote URL by itself; `expo-three`'s `TextureLoader` resolves it
 *   through `expo-asset` (download to cache, then decode) instead.
 */
async function loadTexture(url: string): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    return new THREE.TextureLoader().loadAsync(url);
  }
  const { TextureLoader } = await import('expo-three');
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url, resolve, undefined, reject);
  });
}

/**
 * Loads a texture, falling back to `null` on any failure (e.g. a dead URL)
 * so a failed load doesn't block rendering the rest of the avatar — it just
 * renders without that decal.
 */
async function loadTextureSafe(url: string): Promise<THREE.Texture | null> {
  try {
    return await loadTexture(url);
  } catch {
    return null;
  }
}

/**
 * Loads the rigged humanoid GLB bundled with the app
 * (`assets/models/BaseHuman.glb`).
 *
 * `expo-asset`'s `Asset.fromModule` resolves the `require(...)` module
 * (a numeric Metro asset ID on native, a bundled URL on web) into a
 * fetchable URI on both platforms; after `downloadAsync()`, `.localUri` is
 * the on-device cache path on native, and equals `.uri` on web (there's no
 * separate local filesystem to cache into there). `GLTFLoader` is `three`'s
 * own loader (not `expo-three`'s) since the GLB embeds its one binary
 * buffer directly — no external textures or `.bin` file to resolve
 * relative to a base path — so none of `expo-three`'s asset-resolution
 * glue is actually needed for this asset.
 *
 * Bytes are read directly via `readUriBytes` (same helper the face-texture
 * pipeline uses) and handed to `parseAsync` instead of `loadAsync(url)` —
 * `loadAsync` goes through `three`'s `FileLoader`, which fetches over RN's
 * `fetch()` with a streamed `response.body.getReader()`. That path doesn't
 * behave like a browser on native (missing `ProgressEvent` global, and the
 * final read can land as a stringified `[object ArrayBuffer]` instead of
 * real bytes, which then fails `JSON.parse` inside `GLTFLoader.parse`).
 * Reading the file's bytes ourselves sidesteps `FileLoader` entirely.
 */
async function loadAvatarModel(): Promise<GLTF> {
  const asset = Asset.fromModule(require('@/assets/models/BaseHuman.glb'));
  await asset.downloadAsync();
  const modelUrl = asset.localUri ?? asset.uri;
  const bytes = await readUriBytes(modelUrl);
  // `Uint8Array.buffer` types as `ArrayBufferLike` (TS lib allows a
  // `SharedArrayBuffer` backing); `readUriBytes` never produces one, so
  // this is always a plain `ArrayBuffer` at runtime.
  return new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
}

/**
 * Rotates the rig's arm bones (found by name) from the authored bind pose
 * into a relaxed "arms at the sides" pose. Static and one-shot — there's no
 * animation system here, just a fixed local rotation applied once after
 * load. Missing bones are ignored rather than throwing, in case a future
 * model swap uses slightly different joint names.
 */
function relaxArmsToSides(scene: THREE.Group) {
  scene.getObjectByName('upperarm_L')?.rotateZ(-UPPER_ARM_DROP_RADIANS);
  scene.getObjectByName('upperarm_R')?.rotateZ(UPPER_ARM_DROP_RADIANS);
}

/**
 * Adds a transparent face-photo decal, positioned at the `head` bone's real
 * bind-pose position (see `bindPose.ts`) plus a small forward/up offset —
 * not parented to the `head` bone object itself, since its own live
 * transform can't be used for placement.
 *
 * Same technique the old procedural head used (a separate decal plane, not
 * a material slot on the head mesh itself): `compositeToTexture` feathers
 * the source photo to transparent outside a circle, and a
 * `MeshStandardMaterial` only honors that alpha channel with
 * `transparent: true` — which needs an opaque surface behind it to blend
 * into. Layering a transparent decal in front of the (opaque, skin-toned)
 * sculpted face gives it that surface to blend into, the same way a
 * material's own alpha channel wouldn't.
 */
function attachFaceDecal(scene: THREE.Group, mesh: THREE.SkinnedMesh, faceTexture: THREE.Texture) {
  const headPos = bindPosePosition(mesh, 'head');
  if (!headPos) {
    return;
  }
  const faceDecal = createDecal(faceTexture, FACE_DECAL_SIZE, FACE_DECAL_SIZE);
  faceDecal.name = 'faceDecal';
  // A plane's default normal is +Z, which already matches this rig's
  // forward direction — no extra rotation needed.
  faceDecal.position.set(headPos.x, headPos.y + FACE_DECAL_OFFSET_Y, headPos.z + FACE_DECAL_OFFSET_Z);
  scene.add(faceDecal);
}

/**
 * Renders the rigged humanoid avatar (`assets/models/BaseHuman.glb`) and
 * lets the user spin it around the Y axis by dragging horizontally.
 *
 * Rendering backend: `expo-gl`'s `<GLView>` for the actual surface. On
 * native this is backed by a native EXGL context; on web `expo-gl` ships a
 * real implementation too — an actual `<canvas>` + `WebGLRenderingContext`
 * (see `expo-gl`'s `GLView.web.tsx`) — so the exact same component and
 * `onContextCreate` callback work unmodified on both platforms. A
 * hand-rolled parallel `<canvas>` + `THREE.WebGLRenderer` web branch would
 * just reimplement what `expo-gl` already provides.
 *
 * Note: `measurements`/`faceTextureUrl`/`equippedGarment` are only read
 * once, when the GL context is first created (`GLView` never re-fires
 * `onContextCreate` on prop changes). If the caller's data can change after
 * this component is already mounted, pass a `key` that changes with it to
 * force a remount — e.g. the Fitting Room screen keys this on the equipped
 * item's id so trying on a different garment remounts the whole view.
 */
export function Avatar3DView({ faceTextureUrl, equippedGarment }: Avatar3DViewProps) {
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const rotationAtGestureStart = useRef(0);
  const frameRef = useRef<number | null>(null);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      rotationAtGestureStart.current = avatarGroupRef.current?.rotation.y ?? 0;
    })
    .onUpdate((event) => {
      if (avatarGroupRef.current) {
        avatarGroupRef.current.rotation.y = rotationAtGestureStart.current + event.translationX * ROTATE_SPEED;
      }
    });

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0xf2f2f2, 1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        CAMERA_FOV_DEGREES,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        100
      );

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(1.5, 2, 2);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-1.5, -1, 1.5);
      scene.add(fillLight);

      const [faceTexture, garmentTexture, gltf] = await Promise.all([
        faceTextureUrl ? loadTextureSafe(faceTextureUrl) : Promise.resolve(null),
        equippedGarment ? loadTextureSafe(equippedGarment.textureUrl) : Promise.resolve(null),
        loadAvatarModel(),
      ]);

      relaxArmsToSides(gltf.scene);
      const skinnedMesh = findSkinnedMesh(gltf.scene);
      if (skinnedMesh) {
        if (faceTexture) {
          attachFaceDecal(gltf.scene, skinnedMesh, faceTexture);
        }
        if (garmentTexture && equippedGarment) {
          attachGarmentDecal(gltf.scene, skinnedMesh, equippedGarment.category, garmentTexture);
        }
      }

      // Camera distance derived from the loaded mesh's own bounding box —
      // there's no measurements-driven formula anymore (see the
      // `measurements` prop doc comment above), so framing stays correct
      // regardless of the model's authored scale rather than any user input.
      const boundingBox = new THREE.Box3().setFromObject(gltf.scene);
      const avatarHeight = boundingBox.max.y - boundingBox.min.y;
      const verticalFovRadians = (CAMERA_FOV_DEGREES * Math.PI) / 180;
      const cameraDistance = (avatarHeight * CAMERA_FRAMING_MARGIN) / (2 * Math.tan(verticalFovRadians / 2));
      camera.position.set(0, 0, cameraDistance);

      const avatarGroup = new THREE.Group();
      avatarGroup.name = 'avatar';
      avatarGroup.add(gltf.scene);
      // Center the whole avatar vertically around the origin (using the
      // bounding box just computed) so orbiting looks natural instead of
      // pivoting around the feet.
      avatarGroup.position.y = -(boundingBox.min.y + boundingBox.max.y) / 2;
      avatarGroupRef.current = avatarGroup;
      scene.add(avatarGroup);

      const render = () => {
        frameRef.current = requestAnimationFrame(render);
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <GLView style={styles.canvas} onContextCreate={onContextCreate} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
});

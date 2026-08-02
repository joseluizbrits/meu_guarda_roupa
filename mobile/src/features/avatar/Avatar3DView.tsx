import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Radians of Y-axis rotation per pixel of horizontal drag. Free-spin (no
// clamping) — simplest behavior and fine for an MVP turntable view.
const ROTATE_SPEED = 0.012;
const CAMERA_FOV_DEGREES = 45;
// Extra headroom above/below the avatar so it doesn't touch the frame edges.
const CAMERA_FRAMING_MARGIN = 1.35;

// The rig's authored bind pose is closer to a T-pose than a natural stance
// (arms extend outward and only slope down ~25-30 degrees) — looks broken
// for a "look at your outfit" view. These angles were derived from the
// GLB's own bind-pose joint matrices (each arm bone's local Z/"roll" axis
// is aligned with world Z, so rotating around it swings the bone within
// the body's width/height plane) and tuned against a render: rotating each
// upper arm by ~64 degrees brings the hand down to rest just outside the
// thigh; a first attempt at also adding a large forearm-only rotation for
// the elbow bend overshot and crossed the hands in front of the groin, so
// the forearm's own extra rotation is kept small. `_L`/`_R` bones are
// mirrored, hence opposite signs.
const UPPER_ARM_DROP_RADIANS = THREE.MathUtils.degToRad(64);
const ELBOW_BEND_RADIANS = THREE.MathUtils.degToRad(5);

// Face decal placement, derived from the GLB's own bind-pose vertex data
// (the `head`-bone-weighted vertices), not guessed: the head bone's origin
// sits near the jaw, and its local Z axis already points toward the front
// of the face (same forward convention as the rest of the rig, verified
// against the mesh's own geometry). These offsets are in the head bone's
// local space and center the decal roughly over the nose/eye area, just
// in front of the sculpted face surface.
const FACE_DECAL_SIZE = 0.17;
const FACE_DECAL_LOCAL_OFFSET_Y = 0.02;
const FACE_DECAL_LOCAL_OFFSET_Z = 0.13;

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
};

/**
 * Loads a remote image URL into a `THREE.Texture`.
 *
 * - Web: runs in an actual browser (react-native-web), so plain
 *   `THREE.TextureLoader` works as-is — no Expo asset resolution needed.
 * - Native: there's no DOM/`Image` global, so `THREE.TextureLoader` can't
 *   load a remote URL by itself; `expo-three`'s `TextureLoader` resolves it
 *   through `expo-asset` (download to cache, then decode) instead.
 */
async function loadFaceTexture(url: string): Promise<THREE.Texture> {
  if (Platform.OS === 'web') {
    return new THREE.TextureLoader().loadAsync(url);
  }
  const { TextureLoader } = await import('expo-three');
  return new Promise((resolve, reject) => {
    new TextureLoader().load(url, resolve, undefined, reject);
  });
}

/**
 * Loads the face texture, falling back to `null` on any failure (e.g. a
 * dead URL) so a failed texture load doesn't block rendering the rest of
 * the avatar — it just renders without a face decal.
 */
async function loadFaceTextureSafe(url: string): Promise<THREE.Texture | null> {
  try {
    return await loadFaceTexture(url);
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
 */
async function loadAvatarModel(): Promise<GLTF> {
  const asset = Asset.fromModule(require('@/assets/models/BaseHuman.glb'));
  await asset.downloadAsync();
  const modelUrl = asset.localUri ?? asset.uri;
  return new GLTFLoader().loadAsync(modelUrl);
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
  scene.getObjectByName('lowerarm_L')?.rotateZ(-ELBOW_BEND_RADIANS);
  scene.getObjectByName('lowerarm_R')?.rotateZ(ELBOW_BEND_RADIANS);
}

/**
 * Parents a transparent face-photo decal to the `head` bone.
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
function attachFaceDecal(scene: THREE.Group, faceTexture: THREE.Texture) {
  const headBone = scene.getObjectByName('head');
  if (!headBone) {
    return;
  }
  const decalGeometry = new THREE.PlaneGeometry(FACE_DECAL_SIZE, FACE_DECAL_SIZE);
  const decalMaterial = new THREE.MeshStandardMaterial({
    map: faceTexture,
    transparent: true,
    roughness: 0.9,
  });
  const faceDecal = new THREE.Mesh(decalGeometry, decalMaterial);
  faceDecal.name = 'faceDecal';
  // A plane's default normal is +Z, which already matches the head bone's
  // own local-Z "forward" direction (verified against the GLB's bind-pose
  // vertex data) — no extra rotation needed.
  faceDecal.position.set(0, FACE_DECAL_LOCAL_OFFSET_Y, FACE_DECAL_LOCAL_OFFSET_Z);
  headBone.add(faceDecal);
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
 * Note: `measurements`/`faceTextureUrl` are only read once, when the GL
 * context is first created (`GLView` never re-fires `onContextCreate` on
 * prop changes). If the caller's data can change after this component is
 * already mounted, pass a `key` that changes with it to force a remount.
 */
export function Avatar3DView({ faceTextureUrl }: Avatar3DViewProps) {
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

      const [faceTexture, gltf] = await Promise.all([
        faceTextureUrl ? loadFaceTextureSafe(faceTextureUrl) : Promise.resolve(null),
        loadAvatarModel(),
      ]);

      relaxArmsToSides(gltf.scene);
      if (faceTexture) {
        attachFaceDecal(gltf.scene, faceTexture);
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';
import { loadTextureCached } from './avatarTextures';
import { bindPosePosition, findSkinnedMesh } from './bindPose';
import { createDecal } from './decal';
import { readUriBytes } from './faceTexture/readUriBytes';
import { attachGarmentShell } from './garmentShell';
import { attachGarmentTemplate } from './garmentTemplate';

const ROTATE_SPEED = 0.012;
const CAMERA_FOV_DEGREES = 45;
// Extra headroom above/below the avatar so it doesn't touch the frame edges.
const CAMERA_FRAMING_MARGIN = 1.35;

// Face decal placement. Offset from the `head` bone's real bind-pose
// position (see `bindPose.ts` — the bone object's own live transform can't
// be used directly).
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

type EquippedGarment = {
  id: string;
  category: WardrobeCategory;
  textureUrl: string;
};

type Avatar3DViewProps = {
  // Accepted for future phases (e.g. fitting garments to body shape), but
  // deliberately NOT applied to the loaded mesh in this pass — the rig has
  // no morph targets, and bone-scaling a skinned mesh to match 6
  // measurement inputs well is a separate, harder problem than getting the
  // real mesh rendering. The model loads at its authored scale.
  measurements: AvatarMeasurements;
  faceTextureUrl?: string | null;
  // Garments currently "tried on". Each is applied as a volumetric shell on
  // its body region (see `garmentShell.ts`). Multiple categories can be worn
  // simultaneously (top + bottom + shoes), and the component reconciles
  // changes in-place — no remount, no re-load of the base model.
  equippedGarments?: EquippedGarment[];
};

// ---------------------------------------------------------------------------
// Module-level GLB cache shared across Avatar3DView instances (and around the
// whole screen lifetime, not just one mount). Loading the GLB is the single
// most expensive step (a ~1.9 MB parse). Textures live in `avatarTextures.ts`
// (same session-scoped promise cache) so Fitting Room can pre-warm them.
// ---------------------------------------------------------------------------

let gltfCache: Promise<GLTF> | null = null;

/**
 * Loads the rigged humanoid GLB bundled with the app
 * (`assets/models/BaseHuman.glb`), cached module-level so a second visit or
 * a component remount doesn't re-parse it.
 */
function loadAvatarModel(): Promise<GLTF> {
  if (!gltfCache) {
    gltfCache = (async () => {
      const asset = Asset.fromModule(require('@/assets/models/BaseHuman.glb'));
      await asset.downloadAsync();
      const modelUrl = asset.localUri ?? asset.uri;
      const bytes = await readUriBytes(modelUrl);
      return new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    })();
  }
  return gltfCache;
}

/**
 * Adds a transparent face-photo decal, positioned at the `head` bone's real
 * bind-pose position.
 */
function attachFaceDecal(scene: THREE.Group, mesh: THREE.SkinnedMesh, faceTexture: THREE.Texture) {
  const headPos = bindPosePosition(mesh, 'head');
  if (!headPos) {
    return;
  }
  const faceDecal = createDecal(faceTexture, FACE_DECAL_SIZE, FACE_DECAL_SIZE);
  faceDecal.name = 'faceDecal';
  faceDecal.position.set(headPos.x, headPos.y + FACE_DECAL_OFFSET_Y, headPos.z + FACE_DECAL_OFFSET_Z);
  scene.add(faceDecal);
}

/**
 * Renders the rigged humanoid avatar (`assets/models/BaseHuman.glb`) and
 * lets the user spin it around the Y axis by dragging horizontally. The
 * model's own authored pose is kept as-is — earlier we force-rotated the
 * upper arms 58° into a "hands at the sides" stance, which read as crooked
 * on the real device.
 * - The GLB is parsed once and cached module-level; textures are cached per
 *   URL. Garment changes are reconciled in-place on the scene graph — the
 *   `GLView` context is never torn down for a swap (no remount `key`).
 * - Rendering is on-demand: a dirty flag schedules exactly one frame instead
 *   of an unconditionally-running requestAnimationFrame loop, so an idle
 *   avatar burns no GPU/battery.
 */
export function Avatar3DView({ faceTextureUrl, equippedGarments = [] }: Avatar3DViewProps) {
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const rotationAtGestureStart = useRef(0);
  const frameScheduled = useRef(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const skinnedMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  // Shells must be parented under the avatar group (gltf.scene), NOT the root
  // scene: the avatar group carries the vertical centering offset applied
  // after the GLB's own bounding box is measured. Root-scene children would
  // sit in raw bind-pose space and render floating outside the character.
  const garmentParentRef = useRef<THREE.Object3D | null>(null);
  const garmentNamesRef = useRef<string[]>([]);
  const [contextReady, setContextReady] = useState(false);

  // ------------------------------------------------------------------
  // On-demand renderer: schedule one frame, coalescing multiple requests.
  // ------------------------------------------------------------------
  const requestRender = useCallback(() => {
    if (frameScheduled.current) {
      return;
    }
    frameScheduled.current = true;
    requestAnimationFrame(() => {
      frameScheduled.current = false;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const gl = glRef.current;
      if (renderer && scene && camera && gl) {
        renderer.render(scene, camera);
        gl.endFrameEXP();
      }
    });
  }, []);

  // Syncs the WebGL viewport whenever the GLView gets its final layout
  // (and on rotations/resizes). If the camera keeps the aspect captured at
  // context creation — which can be 0×0 just before first layout — the
  // avatar renders stretched/crooked.
  const onLayout = useCallback(() => {
    const gl = glRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!gl || !renderer || !camera) {
      return;
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (!width || !height) {
      return;
    }
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }, [requestRender]);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      rotationAtGestureStart.current = avatarGroupRef.current?.rotation.y ?? 0;
    })
    .onUpdate((event) => {
      if (avatarGroupRef.current) {
        avatarGroupRef.current.rotation.y = rotationAtGestureStart.current + event.translationX * ROTATE_SPEED;
        requestRender();
      }
    });

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      glRef.current = gl;
      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0xf2f2f2, 1);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;
      const camera = new THREE.PerspectiveCamera(
        CAMERA_FOV_DEGREES,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        100
      );
      cameraRef.current = camera;

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(1.5, 2, 2);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-1.5, -1, 1.5);
      scene.add(fillLight);

      const [faceTexture, gltf] = await Promise.all([
        faceTextureUrl ? loadTextureCached(faceTextureUrl) : Promise.resolve(null),
        loadAvatarModel(),
      ]);
      if (!gl) {
        // Context torn down while we were loading — abort.
        return;
      }

      // The GLB is parsed once and cached module-level (`gltfCache`), but
      // each mount works on its own DEEP CLONE of the scene: `relaxArmsToSides`,
      // face-decal and garment-shell placement all mutate the graph, and the
      // GLView remounts every time the user leaves and re-enters the tab. A
      // shared scene would accumulate those edits visit after visit (arms
      // rotate a second time, shells/decals pile up) — the mannequin ends up
      // in a different stance every return. Cloning gives every mount a
      // pristine bind pose + empty garment parent, so the avatar always comes
      // back exactly as it was left.
      const modelScene = cloneSkinned(gltf.scene) as THREE.Group;

      const skinnedMesh = findSkinnedMesh(modelScene);
      skinnedMeshRef.current = skinnedMesh;
      // All garment shells attach under the avatar group (see the comment on
      // `garmentParentRef`) so they inherit its centering transform.
      garmentParentRef.current = modelScene;
      if (skinnedMesh && faceTexture) {
        attachFaceDecal(modelScene, skinnedMesh, faceTexture);
      }

      // Camera distance derived from the loaded mesh's own bounding box.
      const boundingBox = new THREE.Box3().setFromObject(modelScene);
      const avatarHeight = boundingBox.max.y - boundingBox.min.y;
      const verticalFovRadians = (CAMERA_FOV_DEGREES * Math.PI) / 180;
      const cameraDistance = (avatarHeight * CAMERA_FRAMING_MARGIN) / (2 * Math.tan(verticalFovRadians / 2));
      camera.position.set(0, 0, cameraDistance);

      const avatarGroup = new THREE.Group();
      avatarGroup.name = 'avatar';
      avatarGroup.add(modelScene);
      avatarGroup.position.y = -(boundingBox.min.y + boundingBox.max.y) / 2;
      avatarGroupRef.current = avatarGroup;
      scene.add(avatarGroup);

      setContextReady(true);
      requestRender();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ------------------------------------------------------------------
  // Reconcile garments in-place whenever the equipped set changes.
  // Removes every previously-placed shell and adds shells for the current
  // garments. Runs after the context is ready (and after each change).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!contextReady) {
      return;
    }
    let cancelled = false;
    (async () => {
      const mesh = skinnedMeshRef.current;
      const parent = garmentParentRef.current;
      if (!parent || !mesh) {
        return;
      }

      // Remove shells from the previous reconciliation (matched by name).
      if (garmentNamesRef.current.length > 0) {
        const previousNames = new Set(garmentNamesRef.current);
        // Rebuild the filter list each pass because `parent.children` is
        // live; collecting first avoids mutating during iteration.
        const toRemove = parent.children.filter((child) => previousNames.has(child.name));
        toRemove.forEach((child) => parent.remove(child));
        garmentNamesRef.current = [];
      }

      const added: string[] = [];
      // Load textures in parallel, then attach templates.
      const texturePromises = equippedGarments.map((g) => loadTextureCached(g.textureUrl));
      const textures = await Promise.all(texturePromises);
      if (cancelled) {
        return;
      }
      for (let index = 0; index < equippedGarments.length; index += 1) {
        const garment = equippedGarments[index];
        const texture = textures[index];
        if (!texture) {
          continue;
        }
        // Real template mesh first; if the template failed to load, fall back
        // to the classic cylindrical shell (fail-open, never crash the scene).
        const attached = await attachGarmentTemplate(parent, mesh, garment.category, texture);
        const settled = attached.length > 0 ? attached : attachGarmentShell(parent, mesh, garment.category, texture);
        settled.forEach((object) => added.push(object.name));
      }
      garmentNamesRef.current = added;
      requestRender();
    })();
    return () => {
      cancelled = true;
    };
  }, [contextReady, equippedGarments, requestRender]);

  // Cache is intentionally module-level session-scoped: leaving the tab
  // unmounts the GLView, and re-entering re-runs onContextCreate. Keeping
  // the parsed GLB + textures alive across that remount is exactly what
  // makes the Fitting Room feel instant instead of re-importing a 1.9 MB
  // model every visit.

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container} onLayout={onLayout}>
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
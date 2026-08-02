import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AvatarMeasurements, buildProceduralAvatar, getAvatarWorldHeight } from '@/src/features/avatar/proceduralBody';

// Radians of Y-axis rotation per pixel of horizontal drag. Free-spin (no
// clamping) — simplest behavior and fine for an MVP turntable view.
const ROTATE_SPEED = 0.012;
const CAMERA_FOV_DEGREES = 45;
// Extra headroom above/below the avatar so it doesn't touch the frame edges.
const CAMERA_FRAMING_MARGIN = 1.35;

type Avatar3DViewProps = {
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
 * Renders the procedural avatar (see `proceduralBody.ts`) and lets the user
 * spin it around the Y axis by dragging horizontally.
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
export function Avatar3DView({ measurements, faceTextureUrl }: Avatar3DViewProps) {
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
      // Distance derived from the avatar's actual height so it stays
      // fully framed regardless of the user's measurements (a fixed
      // distance would clip very tall avatars and leave short ones tiny).
      const avatarHeight = getAvatarWorldHeight(measurements);
      const verticalFovRadians = (CAMERA_FOV_DEGREES * Math.PI) / 180;
      const cameraDistance = (avatarHeight * CAMERA_FRAMING_MARGIN) / (2 * Math.tan(verticalFovRadians / 2));
      camera.position.set(0, 0, cameraDistance);

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(1.5, 2, 2);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-1.5, -1, 1.5);
      scene.add(fillLight);

      let faceTexture: THREE.Texture | null = null;
      if (faceTextureUrl) {
        try {
          faceTexture = await loadFaceTexture(faceTextureUrl);
        } catch {
          // Fall back to the plain skin-tone material set up in
          // buildProceduralAvatar — a failed texture load shouldn't block
          // rendering the rest of the avatar.
          faceTexture = null;
        }
      }

      const avatarGroup = buildProceduralAvatar(measurements, faceTexture);
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

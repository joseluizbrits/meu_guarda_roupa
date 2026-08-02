import * as THREE from 'three';

export type AvatarMeasurements = {
  height_cm: number;
  chest_cm: number;
  waist_cm: number;
  hip_cm: number;
  shoulder_cm: number;
  inseam_cm: number;
};

/**
 * Adult-average reference measurements the procedural mesh is sculpted
 * against. Each body segment's scale is derived from the ratio between the
 * user's measurement and its matching reference value below — tune these if
 * the proportions look off, they're not derived from any biomechanical
 * model, just reasonable defaults.
 */
export const REFERENCE_MEASUREMENTS: AvatarMeasurements = {
  height_cm: 170,
  chest_cm: 90,
  waist_cm: 75,
  hip_cm: 95,
  shoulder_cm: 45,
  inseam_cm: 80,
};

const SKIN_COLOR = 0xe0ac8f;
const CLOTHING_COLOR = 0x445566;

// Base (unscaled) dimensions in "world" units for the reference body, loosely
// proportioned like a real adult at REFERENCE_MEASUREMENTS.
const BASE = {
  headSize: 0.24,
  torsoWidth: 0.5,
  torsoDepth: 0.28,
  torsoHeight: 0.62,
  armRadius: 0.08,
  armLength: 0.62,
  legRadius: 0.12,
  legLength: 0.9,
  neckHeight: 0.06,
};

function computeLayout(measurements: AvatarMeasurements) {
  const heightScale = measurements.height_cm / REFERENCE_MEASUREMENTS.height_cm;
  const chestScale = measurements.chest_cm / REFERENCE_MEASUREMENTS.chest_cm;
  const waistScale = measurements.waist_cm / REFERENCE_MEASUREMENTS.waist_cm;
  const hipScale = measurements.hip_cm / REFERENCE_MEASUREMENTS.hip_cm;
  const shoulderScale = measurements.shoulder_cm / REFERENCE_MEASUREMENTS.shoulder_cm;
  const inseamScale = measurements.inseam_cm / REFERENCE_MEASUREMENTS.inseam_cm;

  // Torso girth blends chest/waist/hip since a single capsule can't vary
  // radius along its length — average them into one horizontal scale.
  const torsoGirthScale = (chestScale + waistScale + hipScale) / 3;

  const legLength = BASE.legLength * inseamScale;
  const torsoHeight = BASE.torsoHeight * heightScale;
  const armLength = BASE.armLength * heightScale;
  const shoulderY = legLength + torsoHeight * 0.85;
  const headSize = BASE.headSize * heightScale;
  const topOfHeadY = shoulderY + BASE.neckHeight + headSize;

  return {
    heightScale,
    chestScale,
    waistScale,
    hipScale,
    shoulderScale,
    inseamScale,
    torsoGirthScale,
    legLength,
    torsoHeight,
    armLength,
    shoulderY,
    headSize,
    topOfHeadY,
  };
}

/**
 * Total world-space height of the built avatar (feet to top of head), for
 * callers that need to frame a camera around it without actually building
 * the mesh (e.g. `Avatar3DView` picking a camera distance).
 */
export function getAvatarWorldHeight(measurements: AvatarMeasurements): number {
  return computeLayout(measurements).topOfHeadY;
}

/**
 * This is a deliberate placeholder: there is no sculpted/rigged mesh (no
 * artist, no GLB asset) yet, so the avatar is built from simple Three.js
 * primitives scaled by the user's measurements. Each body part is a
 * separately named `THREE.Group`/`THREE.Mesh` (`head`, `torso`, `leftArm`,
 * `rightArm`, `leftLeg`, `rightLeg`) so later phases (garment fitting) can
 * target specific regions by name — swapping this for a real rigged mesh
 * later shouldn't require touching call sites that reference these names.
 */
export function buildProceduralAvatar(measurements: AvatarMeasurements, faceTexture?: THREE.Texture | null): THREE.Group {
  const root = new THREE.Group();
  root.name = 'avatar';

  const layout = computeLayout(measurements);
  const { chestScale, hipScale, shoulderScale, torsoGirthScale, legLength, torsoHeight, armLength, shoulderY, headSize } =
    layout;

  // --- Legs ---
  const legGeometry = new THREE.CapsuleGeometry(BASE.legRadius, legLength * 0.7, 4, 12);
  const legMaterial = new THREE.MeshStandardMaterial({ color: CLOTHING_COLOR, roughness: 0.8 });

  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.name = 'leftLeg';
  leftLeg.scale.set(hipScale, 1, hipScale);
  leftLeg.position.set(-BASE.legRadius * 1.4 * shoulderScale, legLength / 2, 0);

  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.name = 'rightLeg';
  rightLeg.scale.set(hipScale, 1, hipScale);
  rightLeg.position.set(BASE.legRadius * 1.4 * shoulderScale, legLength / 2, 0);

  // --- Torso ---
  const torsoGeometry = new THREE.CapsuleGeometry(BASE.torsoWidth / 2, torsoHeight * 0.6, 4, 12);
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: CLOTHING_COLOR, roughness: 0.7 });
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.name = 'torso';
  torso.scale.set(shoulderScale, torsoHeight / (BASE.torsoWidth / 2 + torsoHeight * 0.6), torsoGirthScale * (BASE.torsoDepth / BASE.torsoWidth) * 2);
  torso.position.set(0, legLength + torsoHeight / 2, 0);

  // --- Arms ---
  const armGeometry = new THREE.CapsuleGeometry(BASE.armRadius, armLength * 0.75, 4, 12);
  const armMaterial = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.6 });

  const shoulderX = (BASE.torsoWidth / 2 + BASE.armRadius) * shoulderScale;

  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  leftArm.name = 'leftArm';
  leftArm.scale.set(chestScale * 0.8, 1, chestScale * 0.8);
  leftArm.position.set(-shoulderX, shoulderY - armLength / 2, 0);

  const rightArm = new THREE.Mesh(armGeometry, armMaterial);
  rightArm.name = 'rightArm';
  rightArm.scale.set(chestScale * 0.8, 1, chestScale * 0.8);
  rightArm.position.set(shoulderX, shoulderY - armLength / 2, 0);

  // --- Head ---
  // A box (not a sphere) so a flat face photo can be mapped onto a flat
  // quad without the distortion a sphere UV-wrap would cause: a plain
  // skin-tone box, plus — when a face texture is available — a separate
  // "decal" plane parented just in front of its +Z face.
  //
  // The decal is a second mesh rather than a 6th box-face material because
  // `compositeToTexture` deliberately feathers the texture to transparent
  // outside a circle (so it also works as a plain circular preview image
  // elsewhere in the app). A `MeshStandardMaterial` only honors that alpha
  // channel with `transparent: true`, and a *box face* has nothing behind
  // it to blend with — the "transparent" pixels would show the scene
  // background straight through the head. Layering a transparent decal
  // over an opaque skin-tone box face instead lets the feathered edges
  // blend into the skin tone, like intended.
  const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
  const headBoxMaterial = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.6 });
  const headBox = new THREE.Mesh(headGeometry, headBoxMaterial);
  headBox.name = 'headBox';

  const head = new THREE.Group();
  head.name = 'head';
  head.add(headBox);

  if (faceTexture) {
    const decalGeometry = new THREE.PlaneGeometry(headSize * 0.92, headSize * 0.92);
    const decalMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      transparent: true,
      roughness: 0.9,
    });
    const faceDecal = new THREE.Mesh(decalGeometry, decalMaterial);
    faceDecal.name = 'faceDecal';
    // A plane's default normal is +Z, which already faces the same
    // direction as the box's front face — no rotation needed. Nudged
    // slightly forward to avoid z-fighting with the box surface.
    faceDecal.position.set(0, 0, headSize / 2 + 0.002);
    head.add(faceDecal);
  }

  head.position.set(0, shoulderY + BASE.neckHeight + headSize / 2, 0);

  root.add(leftLeg, rightLeg, torso, leftArm, rightArm, head);
  // Center the whole avatar vertically around the origin so orbiting looks
  // natural instead of pivoting around the feet.
  root.position.y = -layout.topOfHeadY / 2;

  return root;
}

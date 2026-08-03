import * as THREE from 'three';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';
import { bindPosePosition } from './bindPose';
import { createDecal } from './decal';

// How far in front of the body surface each decal sits, along +Z (this
// rig's confirmed forward axis — the toes bones sit at a higher bind-pose Z
// than their feet, front-facing). Expressed as a fraction of the decal's
// own width. Starting estimate, tuned against a real render — see the
// phase-5 plan.
const FORWARD_OFFSET_RATIO = 0.4;

// Real garment coverage is wider/taller than the raw bone-to-bone distance
// it's measured from — these margins are rough visual approximations,
// tuned against a real render, not measured constants.
const TORSO_WIDTH_MARGIN = 1.1;
const TORSO_HEIGHT_MARGIN = 1.15;
const DRESS_HEIGHT_MARGIN = 1.1;
const LEG_WIDTH_MARGIN = 1.8;
const LEG_HEIGHT_MARGIN = 1.05;
const SHOE_LENGTH_MARGIN = 1.3;
const SHOE_WIDTH_RATIO = 0.55;

function addDecal(scene: THREE.Group, texture: THREE.Texture, width: number, height: number, position: THREE.Vector3) {
  const decal = createDecal(texture, width, height);
  decal.name = 'garmentDecal';
  decal.position.copy(position);
  // Sibling of the skinned mesh, not a child of any bone — see
  // `bindPose.ts` for why bones themselves can't be used as a live parent.
  scene.add(decal);
}

/**
 * Torso decal (top/outerwear/dress), sized/centered from the rig's real
 * bind-pose bone positions (shoulder joints for width, neck down to
 * `bottomBoneName` for height) rather than fixed numbers. Width uses
 * `upperarm_L/R` (the actual shoulder joints), not `clavicle_L/R` — the
 * clavicle bones' bind-pose origin sits close to the sternum, only ~7cm
 * apart, far too narrow a proxy for shoulder width.
 */
function placeTorsoDecal(
  scene: THREE.Group,
  mesh: THREE.SkinnedMesh,
  texture: THREE.Texture,
  bottomBoneName: string,
  heightMargin: number
) {
  const spine02 = bindPosePosition(mesh, 'spine02');
  const shoulderL = bindPosePosition(mesh, 'upperarm_L');
  const shoulderR = bindPosePosition(mesh, 'upperarm_R');
  const neck = bindPosePosition(mesh, 'neck');
  const bottom = bindPosePosition(mesh, bottomBoneName);
  if (!spine02 || !shoulderL || !shoulderR || !neck || !bottom) {
    return;
  }

  const width = Math.abs(shoulderL.x - shoulderR.x) * TORSO_WIDTH_MARGIN;
  const height = Math.abs(neck.y - bottom.y) * heightMargin;
  const centerY = (neck.y + bottom.y) / 2;
  const centerZ = spine02.z + width * FORWARD_OFFSET_RATIO;

  addDecal(scene, texture, width, height, new THREE.Vector3(spine02.x, centerY, centerZ));
}

/** Leg decal (bottom), hanging from the hips down toward the knees. */
function placeLegDecal(scene: THREE.Group, mesh: THREE.SkinnedMesh, texture: THREE.Texture) {
  const pelvis = bindPosePosition(mesh, 'pelvis');
  const thighL = bindPosePosition(mesh, 'thigh_L');
  const thighR = bindPosePosition(mesh, 'thigh_R');
  const calfL = bindPosePosition(mesh, 'calf_L');
  if (!pelvis || !thighL || !thighR || !calfL) {
    return;
  }

  const width = Math.abs(thighL.x - thighR.x) * LEG_WIDTH_MARGIN;
  const height = Math.abs(pelvis.y - calfL.y) * LEG_HEIGHT_MARGIN;
  const centerY = (pelvis.y + calfL.y) / 2;
  const centerZ = pelvis.z + width * FORWARD_OFFSET_RATIO;

  addDecal(scene, texture, width, height, new THREE.Vector3(pelvis.x, centerY, centerZ));
}

/**
 * One small decal per foot (`foot_L`/`foot_R`), sized from the foot→toes
 * span and mirroring the same texture on both feet.
 */
function placeShoeDecals(scene: THREE.Group, mesh: THREE.SkinnedMesh, texture: THREE.Texture) {
  for (const side of ['L', 'R'] as const) {
    const foot = bindPosePosition(mesh, `foot_${side}`);
    const toes = bindPosePosition(mesh, `toes_${side}`);
    if (!foot || !toes) {
      continue;
    }
    const length = foot.distanceTo(toes) * SHOE_LENGTH_MARGIN;
    const width = length * SHOE_WIDTH_RATIO;
    const center = foot.clone().add(toes).multiplyScalar(0.5);
    addDecal(scene, texture, width, length, center);
  }
}

/**
 * Places a garment texture as a decal on the body region matching its
 * category. `accessory` has no single generalizable region (hat vs bag vs
 * scarf differ too much) and is skipped — closet-only in this phase.
 */
export function attachGarmentDecal(scene: THREE.Group, mesh: THREE.SkinnedMesh, category: WardrobeCategory, texture: THREE.Texture): void {
  switch (category) {
    case 'top':
    case 'outerwear':
      placeTorsoDecal(scene, mesh, texture, 'pelvis', TORSO_HEIGHT_MARGIN);
      return;
    case 'dress':
      placeTorsoDecal(scene, mesh, texture, 'calf_L', DRESS_HEIGHT_MARGIN);
      return;
    case 'bottom':
      placeLegDecal(scene, mesh, texture);
      return;
    case 'shoes':
      placeShoeDecals(scene, mesh, texture);
      return;
    case 'accessory':
      return;
  }
}

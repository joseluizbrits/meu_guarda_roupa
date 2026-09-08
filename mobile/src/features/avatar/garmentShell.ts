import * as THREE from 'three';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';
import { bindPosePosition } from './bindPose';

/**
 * Volumetric garment shells.
 *
 * The old approach stamped the cutout onto a flat transparent plane hovering
 * in front of the body — an obvious "image on top of the 3D model". This
 * module replaces that with a shell that actually surrounds the body: an
 * open-ended cylinder whose radius hugs the torso/legs closely, with UVs
 * overwritten to project the cutout *planar* onto the cylinder (front and
 * back share the same projection, so the silhouette reads correctly from
 * every angle instead of being smeared around 360°). The material uses
 * `alphaTest` so the cutout's transparent background disappears and only the
 * garment pixels render — the body shows through anywhere the garment isn't.
 *
 * One shell per body region keeps layering simple:
 *   - upper (top / outerwear) → torso cylinder, neck → pelvis
 *   - dress                     → torso cylinder, neck → calf
 *   - bottom                    → leg cylinder, pelvis → calf
 *   - shoes                     → small box over each foot
 *   - accessory                 → skipped (no generalizable region)
 */

// Extra radius beyond the body the shell sits at — thick enough to clear the
// skin surface, thin enough to look like the garment is hugging the body.
const SHELL_CLEARANCE = 0.025;
// Cylinder radial segments — enough for a smooth silhouette, cheap to draw.
const SHELL_SEGMENTS = 24;

// Radial segment count for a shoe box step — shoes are deliberately coarse.
const SHOE_STEP = 0.01;

function buildShellGeometry(
  radius: number,
  height: number,
  centerY: number,
  segments = SHELL_SEGMENTS
): THREE.BufferGeometry {
  // `openEnded` cylinder: no caps (the body plugs the ends anyway), only the
  // curved surface is needed.
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);
  geometry.translate(0, centerY, 0);

  // Overwrite the default cylindrical UV wrap with a planar projection: u is
  // the world X across the shell, v is the world Y down the shell. Applied to
  // every vertex (front AND back), so the cutout shows its true silhouette on
  // the front and a mirrored copy on the back — much better than smearing the
  // texture around the circumference. Because alphaTest discards the
  // transparent background, the mirrored back reads as "the same garment seen
  // from behind" for roughly symmetric cutouts.
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const width = radius * 2;
  const minY = centerY - height / 2;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    uv.setXY(i, 0.5 + x / width, (y - minY) / height);
  }
  uv.needsUpdate = true;
  return geometry;
}

function buildShellMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    // Hard cutoff for the cutout's transparent background — the body (or the
    // next shell behind) shows through wherever the garment isn't.
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
  });
}

function addShell(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  radius: number,
  height: number,
  centerY: number,
  centerX: number,
  centerZ: number,
  name: string
): THREE.Mesh {
  const geometry = buildShellGeometry(radius, height, centerY);
  const material = buildShellMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(centerX, 0, centerZ);
  parent.add(mesh);
  return mesh;
}

function torsoRadius(mesh: THREE.SkinnedMesh): number | null {
  const shoulderL = bindPosePosition(mesh, 'upperarm_L');
  const shoulderR = bindPosePosition(mesh, 'upperarm_R');
  if (!shoulderL || !shoulderR) {
    return null;
  }
  // Half the shoulder-to-shoulder span, plus the clearance so the shell
  // doesn't intersect the skin. Dresses want a touch more room; callers can
  // scale the result.
  return (Math.abs(shoulderL.x - shoulderR.x) / 2 + SHELL_CLEARANCE) * 1.15;
}

function legRadius(mesh: THREE.SkinnedMesh): number | null {
  const thighL = bindPosePosition(mesh, 'thigh_L');
  const thighR = bindPosePosition(mesh, 'thigh_R');
  if (!thighL || !thighR) {
    return null;
  }
  const span = Math.abs(thighL.x - thighR.x);
  // One shell spanning both legs (like baggy shorts): the planar UV shows
  // both pant legs of the cutout on the front of the cylinder.
  return span / 2 + SHELL_CLEARANCE;
}

/** Torso shell for `top` / `outerwear`. */
function placeTorsoShell(
  scene: THREE.Object3D,
  mesh: THREE.SkinnedMesh,
  texture: THREE.Texture,
  bottomBoneName: string,
  heightScale: number,
  namePrefix: string
): void {
  const radius = torsoRadius(mesh);
  const neck = bindPosePosition(mesh, 'neck');
  const bottom = bindPosePosition(mesh, bottomBoneName);
  const spine02 = bindPosePosition(mesh, 'spine02');
  if (!radius || !neck || !bottom || !spine02) {
    return;
  }
  const height = Math.abs(neck.y - bottom.y) * heightScale;
  const centerY = (neck.y + bottom.y) / 2;
  addShell(scene, texture, radius, height, centerY, spine02.x, spine02.z, `${namePrefix}Shell`);
}

/** Leg shell for `bottom`. */
function placeLegShell(scene: THREE.Object3D, mesh: THREE.SkinnedMesh, texture: THREE.Texture): void {
  const radius = legRadius(mesh);
  const pelvis = bindPosePosition(mesh, 'pelvis');
  const calfL = bindPosePosition(mesh, 'calf_L');
  if (!radius || !pelvis || !calfL) {
    return;
  }
  // Legs are offset outward from the pelvis; center the shell between them.
  const thighL = bindPosePosition(mesh, 'thigh_L');
  const thighR = bindPosePosition(mesh, 'thigh_R');
  const centerX = thighL && thighR ? (thighL.x + thighR.x) / 2 : pelvis.x;
  const height = Math.abs(pelvis.y - calfL.y) * 1.02;
  const centerY = (pelvis.y + calfL.y) / 2;
  addShell(scene, texture, radius, height, centerY, centerX, pelvis.z, 'bottomShell');
}

/** A small box over each foot, matched to the foot→toes span. */
function placeShoeShells(scene: THREE.Object3D, mesh: THREE.SkinnedMesh, texture: THREE.Texture): void {
  const material = buildShellMaterial(texture);
  for (const side of ['L', 'R'] as const) {
    const foot = bindPosePosition(mesh, `foot_${side}`);
    const toes = bindPosePosition(mesh, `toes_${side}`);
    if (!foot || !toes) {
      continue;
    }
    const length = foot.distanceTo(toes) + SHELL_CLEARANCE * 4;
    const width = length * 0.45;
    const height = length * 0.35;
    const centerX = (foot.x + toes.x) / 2;
    const centerZ = (foot.z + toes.z) / 2;
    const centerY = foot.y + height * 0.4;

    // BoxGeometry UVs put the texture on every face; with alphaTest the
    // cutout shows through wherever the shoe silhouette is.
    const geometry = new THREE.BoxGeometry(width, height, length);
    geometry.translate(0, 0, 0);
    const shoe = new THREE.Mesh(geometry, material);
    shoe.name = `shoesShell_${side}`;
    shoe.position.set(centerX, centerY, centerZ);
    // No need to tune UVs — alphaTest + symmetric shoe cutout reads fine.
    void SHOE_STEP;
    scene.add(shoe);
  }
}

/**
 * Attaches a volumetric garment shell for the given category to the scene.
 * Returns the array of meshes added (so callers can remove them later), or an
 * empty array when the category has no shell (accessory) or the rig is missing
 * bones needed for placement.
 */
export function attachGarmentShell(
  scene: THREE.Object3D,
  mesh: THREE.SkinnedMesh,
  category: WardrobeCategory,
  texture: THREE.Texture
): THREE.Object3D[] {
  switch (category) {
    case 'top':
      placeTorsoShell(scene, mesh, texture, 'pelvis', 1.05, 'top');
      return scene.children.filter((child) => child.name === 'topShell');
    case 'outerwear':
      placeTorsoShell(scene, mesh, texture, 'pelvis', 1.12, 'outerwear');
      return scene.children.filter((child) => child.name === 'outerwearShell');
    case 'dress':
      placeTorsoShell(scene, mesh, texture, 'calf_L', 1.08, 'dress');
      return scene.children.filter((child) => child.name === 'dressShell');
    case 'bottom':
      placeLegShell(scene, mesh, texture);
      return scene.children.filter((child) => child.name === 'bottomShell');
    case 'shoes':
      placeShoeShells(scene, mesh, texture);
      return scene.children.filter((child) => child.name.startsWith('shoesShell_'));
    case 'accessory':
      return [];
  }
}
import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';
import { bindPosePosition } from './bindPose';
import { readUriBytes } from './faceTexture/readUriBytes';

/**
 * Body metrics derived from BaseHuman.glb bind pose via measure-body-metrics.mjs.
 * Update if the rig (BaseHuman.glb) changes.
 */
const BODY_METRICS = {
  shouldersArms: { width: 1.1081, depth: 0.2395, centerZ: 0.0353 },
  shouldersOnly: { width: 1.0995, depth: 0.2395, centerZ: 0.0353 },
  waist: { width: 0.4161, depth: 0.2225, centerZ: 0.0286 },
  hips: { width: 0.4391, depth: 0.1844, centerZ: 0.0275 },
  footZ: 0.0065,
  toesZ: 0.1539,
} as const;

/**
 * Real garment meshes by category.
 *
 * The old `garmentShell.ts` stamped the transparent cutout onto a plain
 * cylinder/box, which read as a decal stuck to the body. This module instead
 * loads a per-category template GLB with an actual garment silhouette (torso +
 * sleeves + hem, pant legs + waistband, closed-toe shoe — see
 * `mobile/scripts/generate-garment-templates.mjs`), re-projects the cutout
 * onto it with a planar UV map, and fits it to the avatar from bind-pose
 * measurements (same refs `garmentShell` uses, from `bindPosePosition`).
 *
 * Ownership rules (same philosophy as `loadTextureCached`):
 *   - The template geometry is SHARED and untouchable. It lives in a
 *     module-level promise cache; the planar UV overwrite happens once, on
 *     the cached geometry.
 *   - Each attach returns isolated `mesh.clone()`s that share that geometry;
 *     the per-attach material (own texture) and the clone's own object graph
 *     can be disposed on removal, NEVER the cached geometry.
 *   - One Object3D cannot have two parents, which is exactly why every attach
 *     works on a clone instead of moving the cached mesh around.
 */

type GarmentTemplateCategory = Exclude<WardrobeCategory, 'accessory'>;

// Static `require`s (not a template literal) so Metro can resolve every
// bundled model at build time — same pattern as `BaseHuman.glb`.
const TEMPLATE_MODULES: Record<GarmentTemplateCategory, number> = {
  top: require('@/assets/models/garmentTemplates/top.glb'),
  outerwear: require('@/assets/models/garmentTemplates/outerwear.glb'),
  dress: require('@/assets/models/garmentTemplates/dress.glb'),
  bottom: require('@/assets/models/garmentTemplates/bottom.glb'),
  shoes: require('@/assets/models/garmentTemplates/shoes.glb'),
};

const TEMPLATE_CATEGORIES: GarmentTemplateCategory[] = ['top', 'outerwear', 'dress', 'bottom', 'shoes'];

// Module-level promise cache, one entry per category — mirror of `gltfCache`
// in `Avatar3DView.tsx`. Survival across remounts is exactly why garment swaps
// (and tab re-entries) are instant once a template has been visited once.
const templateCache = new Map<GarmentTemplateCategory, Promise<THREE.Group | null>>();

function loadTemplate(category: GarmentTemplateCategory): Promise<THREE.Group | null> {
  let pending = templateCache.get(category);
  if (!pending) {
    pending = (async () => {
      try {
        const asset = Asset.fromModule(TEMPLATE_MODULES[category]);
        await asset.downloadAsync();
        const modelUrl = asset.localUri ?? asset.uri;
        const bytes = await readUriBytes(modelUrl);
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
        const group = gltf.scene as THREE.Group;
        // Bake the planar UV projection into the shared geometry exactly once.
        applyPlanarUV(group);
        return group;
      } catch {
        // Fail-open: `attachGarmentTemplate` resolves `[]` and the caller
        // falls back to `garmentShell`. Never crash the Fitting Room.
        return null;
      }
    })();
    templateCache.set(category, pending);
  }
  return pending;
}

/**
 * Gives the caller the template GLTFs' mesh geometries a chance to be
 * pre-warmed alongside textures (fire-and-forget, mirrors `warmTextureCache`).
 */
export function warmTemplateCache(): void {
  for (const category of TEMPLATE_CATEGORIES) {
    loadTemplate(category).catch(() => {
      // Ignored — the eventual attach surfaces any real load error.
    });
  }
}

/**
 * Overwrites the geometry UVs with a planar front/back projection in local
 * space (same idea as `garmentShell`, but reading the template's own normals):
 *   u = 0.5 + localX / width
 *   v = (localY - minY) / height
 * Faces pointing away from the camera (local normal.z < 0) get `u = 1 - u` so
 * the cutout silhouette's back side is mirrored — the closed template has
 * distinct front/back triangles, so the check is per-vertex normal, not the
 * "whole shell" heuristic.
 */
function applyPlanarUV(gltf: THREE.Group): void {
  gltf.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) {
      return;
    }
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) {
      return;
    }
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    if (width <= 0 || height <= 0) {
      return;
    }
    const minX = box.min.x;
    const minY = box.min.y;

    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    let uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (!uv) {
      uv = new THREE.BufferAttribute(new Float32Array(position.count * 2), 2);
      geometry.setAttribute('uv', uv);
    }

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      let u = 0.5 + (x - minX) / width;
      const v = (y - minY) / height;
      if (normal.getZ(i) < 0) {
        u = 1 - u;
      }
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// Fit — maps each template onto its body region from bind-pose measurements.
// Templates are authored in the avatar's local space (feet near y=0), so a
// uniform ratio-scale against the region's measured height + the region's
// bone centers is enough; `CLEARANCE` keeps fabric from piercing the skin.
// ---------------------------------------------------------------------------

const CLEARANCE = 0.025;

const FIT: Record<
  GarmentTemplateCategory,
  {
    bottomBone: string;
    heightFactor: number;
    renderOrder: number;
  }
> = {
  top: { bottomBone: 'pelvis', heightFactor: 1.06, renderOrder: 30 },
  outerwear: { bottomBone: 'pelvis', heightFactor: 1.04, renderOrder: 50 },
  dress: { bottomBone: 'calf_L', heightFactor: 1.02, renderOrder: 40 },
  bottom: { bottomBone: 'calf_L', heightFactor: 1.02, renderOrder: 20 },
  shoes: { bottomBone: 'toes_L', heightFactor: 1.06, renderOrder: 10 },
};

function geometryHeight(mesh: THREE.Mesh): number | null {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  return geometry.boundingBox ? geometry.boundingBox.max.y - geometry.boundingBox.min.y : null;
}

function geometryExtent(mesh: THREE.Mesh, axis: 'x' | 'y' | 'z'): { min: number; max: number } | null {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (!geometry.boundingBox) {
    return null;
  }
  return { min: geometry.boundingBox.min[axis], max: geometry.boundingBox.max[axis] };
}

/** Get geometry width/depth/height extents. */
function geometryExtents(mesh: THREE.Mesh): { width: number; height: number; depth: number } | null {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (!geometry.boundingBox) {
    return null;
  }
  const box = geometry.boundingBox;
  return {
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    depth: box.max.z - box.min.z,
  };
}

/** Torso categories: top / outerwear / dress. Scale per axis, center on real body centerZ per band. */
function fitTorso(
  mesh: THREE.Mesh,
  skinnedMesh: THREE.SkinnedMesh,
  category: GarmentTemplateCategory & ('top' | 'outerwear' | 'dress')
): void {
  const { bottomBone, heightFactor } = FIT[category];
  const neck = bindPosePosition(skinnedMesh, 'neck');
  const bottom = bindPosePosition(skinnedMesh, bottomBone);
  if (!neck || !bottom) {
    return;
  }
  const extents = geometryExtents(mesh);
  if (!extents) {
    return;
  }

  // Y scale: match target height (neck to bottom bone * heightFactor)
  const targetHeight = Math.abs(neck.y - bottom.y) * heightFactor;
  const scaleY = targetHeight / extents.height;

  let scaleX: number;
  let scaleZ: number;
  let centerZ: number;

  if (category === 'dress') {
    // Dress: X uses shoulders-only width (flare authored covers hips), Z uses hips depth, centerZ = hips centerZ
    scaleX = BODY_METRICS.shouldersOnly.width / extents.width;
    scaleZ = BODY_METRICS.hips.depth / extents.depth;
    centerZ = BODY_METRICS.hips.centerZ;
  } else {
    // Top / outerwear: X uses shoulders+arms width (sleeve must cover arm), Z uses shoulders+arms depth, centerZ = shoulders+arms centerZ
    scaleX = BODY_METRICS.shouldersArms.width / extents.width;
    scaleZ = BODY_METRICS.shouldersArms.depth / extents.depth;
    centerZ = BODY_METRICS.shouldersArms.centerZ;
  }

  mesh.scale.set(scaleX, scaleY, scaleZ);
  // Position: X=0 (symmetrical), Y=midpoint neck-bottom, Z=band centerZ (NOT spine02.z)
  mesh.position.set(0, (neck.y + bottom.y) / 2, centerZ);
}

/** Bottom: scale to hips only, center on hips centerZ. */
function fitBottom(mesh: THREE.Mesh, skinnedMesh: THREE.SkinnedMesh): void {
  const pelvis = bindPosePosition(skinnedMesh, 'pelvis');
  const calfL = bindPosePosition(skinnedMesh, 'calf_L');
  const height = geometryHeight(mesh);
  if (!pelvis || !calfL || height === null) {
    return;
  }
  const extents = geometryExtents(mesh);
  if (!extents) {
    return;
  }

  // Y scale: pelvis to calf
  const targetHeight = Math.abs(pelvis.y - calfL.y) * FIT.bottom.heightFactor + CLEARANCE;
  const scaleY = targetHeight / extents.height;

  // X and Z: hips metrics only
  const scaleX = BODY_METRICS.hips.width / extents.width;
  const scaleZ = BODY_METRICS.hips.depth / extents.depth;
  const centerZ = BODY_METRICS.hips.centerZ;

  mesh.scale.set(scaleX, scaleY, scaleZ);
  mesh.position.set(0, (pelvis.y + calfL.y) / 2, centerZ);
}

/** Shoes: one clone per foot, scaled Z to cover exactly [footZ, toesZ], centered at midpoint. */
function fitShoe(mesh: THREE.Mesh, skinnedMesh: THREE.SkinnedMesh, side: 'L' | 'R'): void {
  const foot = bindPosePosition(skinnedMesh, `foot_${side}`);
  const toes = bindPosePosition(skinnedMesh, `toes_${side}`);
  const extents = geometryExtents(mesh);
  if (!foot || !toes || !extents) {
    return;
  }

  // Target Z range: exactly footZ -> toesZ (from BODY_METRICS)
  const targetLength = BODY_METRICS.toesZ - BODY_METRICS.footZ;
  const scaleZ = targetLength / extents.depth;

  // Y scale: match foot-to-toes distance * heightFactor (proportional)
  const footToToesDist = foot.distanceTo(toes);
  const targetHeight = footToToesDist * FIT.shoes.heightFactor;
  const scaleY = targetHeight / extents.height;

  // X scale: use template's natural width (or could use foot distance if needed)
  const scaleX = 1.0; // Keep template's authored width

  mesh.scale.set(scaleX, scaleY, scaleZ);
  // Center Z at midpoint of foot and toes, X at midpoint, Y at midpoint
  mesh.position.set(
    (foot.x + toes.x) / 2,
    (foot.y + toes.y) / 2,
    (BODY_METRICS.footZ + BODY_METRICS.toesZ) / 2
  );
}

// ---------------------------------------------------------------------------
// Material + render order.
// ---------------------------------------------------------------------------

function buildTemplateMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    // Discard the cutout's transparent background so the body shows through.
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    // Anti z-fighting: garments sit just off the skin and with depthWrite off
    // the body behind shows through the garment's own transparent gaps.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

// Overlapping garments draw in this order (smallest draws first, biggest on
// top): outerwear covers everything, dress covers top/bottom, bottom over the
// shoes, shoes under all legs.
const RENDER_ORDER: Record<GarmentTemplateCategory, number> = {
  shoes: 10,
  bottom: 20,
  top: 30,
  dress: 40,
  outerwear: 50,
};

/**
 * Attaches the per-category template (cloned per attach, shared geometry) to
 * the scene for the given garment's cutout texture.
 *
 * Returns the meshes added (for remove-by-name bookkeeping), `[]` when the
 * category is `accessory`, or when the template failed to load — the caller
 * then falls back to `garmentShell` (fail-open, never crash the scene).
 */
export async function attachGarmentTemplate(
  scene: THREE.Object3D,
  skinnedMesh: THREE.SkinnedMesh,
  category: WardrobeCategory,
  texture: THREE.Texture
): Promise<THREE.Object3D[]> {
  if (category === 'accessory') {
    return [];
  }
  const template = await loadTemplate(category);
  if (!template) {
    return [];
  }

  const sources: THREE.Mesh[] = [];
  template.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      sources.push(obj as THREE.Mesh);
    }
  });

  const material = buildTemplateMaterial(texture);
  const attached: THREE.Object3D[] = [];
  for (const source of sources) {
    // Shares the cached geometry (UVs already planar); owns only a per-attach
    // material + its own transform, so removing it can't corrupt the cache.
    const clone = source.clone() as THREE.Mesh;
    clone.material = material;
    clone.renderOrder = RENDER_ORDER[category];

    if (category === 'shoes') {
      const side = source.name.endsWith('_R') ? 'R' : 'L';
      fitShoe(clone, skinnedMesh, side);
    } else if (category === 'bottom') {
      fitBottom(clone, skinnedMesh);
    } else {
      fitTorso(clone, skinnedMesh, category);
    }

    clone.matrixAutoUpdate = true;
    clone.updateMatrix();
    scene.add(clone);
    attached.push(clone);
  }
  return attached;
}
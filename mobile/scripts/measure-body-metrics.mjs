import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const glbPath = join(__dirname, '../assets/models/BaseHuman.glb');
const bytes = readFileSync(glbPath);

const loader = new GLTFLoader();
const gltf = await loader.parseAsync(bytes.buffer, '');

let skinnedMesh = null;
gltf.scene.traverse((obj) => {
  if (obj.isSkinnedMesh) {
    skinnedMesh = obj;
  }
});

if (!skinnedMesh) {
  console.error('No SkinnedMesh found');
  process.exit(1);
}

const geometry = skinnedMesh.geometry;
const position = geometry.attributes.position;
const skeleton = skinnedMesh.skeleton;

function getBindPosePosition(boneName) {
  const boneIndex = skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (boneIndex === -1) return null;
  const bindMatrix = skeleton.boneInverses[boneIndex].clone().invert();
  return new THREE.Vector3().setFromMatrixPosition(bindMatrix);
}

// Named Y bands (model local space)
const BANDS = {
  'shoulders+arms': { yMin: 1.25, yMax: 1.49 },
  'shoulders-only': { yMin: 1.25, yMax: 1.49, xMax: 0.55 },
  'waist': { yMin: 0.65, yMax: 0.90 },
  'hips': { yMin: 0.45, yMax: 0.65 },
};

function measureBand(bandName, band) {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let count = 0;

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < band.yMin || y > band.yMax) continue;
    if (band.xMax !== undefined) {
      const x = position.getX(i);
      if (Math.abs(x) > band.xMax) continue;
    }
    const x = position.getX(i);
    const z = position.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    count++;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;

  console.log(`${bandName.padEnd(16)} width=${width.toFixed(4)} depth=${depth.toFixed(4)} centerZ=${centerZ.toFixed(4)} vertices=${count}`);
  return { width, depth, centerZ, minX, maxX, minZ, maxZ };
}

console.log('=== BODY METRICS (bind pose) ===');
const shouldersArms = measureBand('shoulders+arms', BANDS['shoulders+arms']);
const shouldersOnly = measureBand('shoulders-only', BANDS['shoulders-only']);
const waist = measureBand('waist', BANDS['waist']);
const hips = measureBand('hips', BANDS['hips']);

// Foot and toes Z via bindPosePosition
const footL = getBindPosePosition('foot_L');
const toesL = getBindPosePosition('toes_L');
const footR = getBindPosePosition('foot_R');
const toesR = getBindPosePosition('toes_R');

console.log('');
console.log('=== FOOT / TOES Z (bind pose) ===');
if (footL) console.log(`foot_L.z         = ${footL.z.toFixed(4)}`);
if (toesL) console.log(`toes_L.z         = ${toesL.z.toFixed(4)}`);
if (footR) console.log(`foot_R.z         = ${footR.z.toFixed(4)}`);
if (toesR) console.log(`toes_R.z         = ${toesR.z.toFixed(4)}`);

const footZ = footL ? footL.z : 0;
const toesZ = toesL ? toesL.z : 0;
console.log(`foot-z           = ${footZ.toFixed(4)}`);
console.log(`toes-z           = ${toesZ.toFixed(4)}`);

console.log('');
console.log('=== CONSTANTS TABLE (copy into garmentTemplate.ts) ===');
console.log(`BODY_METRICS = {`);
console.log(`  shouldersArms: { width: ${shouldersArms.width.toFixed(4)}, depth: ${shouldersArms.depth.toFixed(4)}, centerZ: ${shouldersArms.centerZ.toFixed(4)} },`);
console.log(`  shouldersOnly: { width: ${shouldersOnly.width.toFixed(4)}, depth: ${shouldersOnly.depth.toFixed(4)}, centerZ: ${shouldersOnly.centerZ.toFixed(4)} },`);
console.log(`  waist: { width: ${waist.width.toFixed(4)}, depth: ${waist.depth.toFixed(4)}, centerZ: ${waist.centerZ.toFixed(4)} },`);
console.log(`  hips: { width: ${hips.width.toFixed(4)}, depth: ${hips.depth.toFixed(4)}, centerZ: ${hips.centerZ.toFixed(4)} },`);
console.log(`  footZ: ${footZ.toFixed(4)},`);
console.log(`  toesZ: ${toesZ.toFixed(4)},`);
console.log(`};`);
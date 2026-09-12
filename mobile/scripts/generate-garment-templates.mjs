#!/usr/bin/env node
/**
 * Generate 5 garment template GLBs from three.js primitives.
 * Outputs: mobile/assets/models/garmentTemplates/{top,outerwear,dress,bottom,shoes}.glb
 *
 * Authoring space = BaseHuman.glb bind-pose local space (y-up, feet near y=0),
 * measured from the rig's `inverseBindMatrices` (see mobile/src/features/avatar/bindPose.ts):
 *   neck y1.4894, spine02 y1.1315, pelvis y0.8512
 *   upperarm x0.1828 y1.4148, thigh x0.1156 y0.9317, calf x0.1547 y0.4975
 *   foot (0.1935, 0.104, 0.0065), toes (0.2038, 0.0215, 0.1539) → feet point +Z
 *
 * Every template is a single static unskinned mesh (shoes: one geometry cloned
 * as two named meshes). Roughly 800–1200 tris each. No bones, no animations,
 * no materials — the app assigns the cutout texture + material at attach time.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'fs';
import path from 'path';

// GLTFExporter converts its Blob output through the browser-only FileReader.
// Node has Blob but no FileReader, so polyfill it with Blob#arrayBuffer().
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    result = null;
    error = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      if (typeof blob?.arrayBuffer !== 'function') {
        this.error = new Error('Blob has no arrayBuffer()');
        this.onloadend?.();
        return;
      }
      blob.arrayBuffer().then(
        (buffer) => {
          this.result = buffer;
          this.onloadend?.();
        },
        (err) => {
          this.error = err;
          this.onloadend?.();
        }
      );
    }
  };
}

const OUTPUT_DIR = path.resolve('/root/hosting/meu_guarda_roupa/mobile/assets/models/garmentTemplates');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const exporter = new GLTFExporter();

function merged(meshes) {
  const flat = [];
  for (const m of meshes) {
    if (Array.isArray(m)) flat.push(...m);
    else flat.push(m);
  }
  const mergedGeom = mergeGeometries(flat, false);
  mergedGeom.computeVertexNormals();
  return mergedGeom;
}

async function writeAndReport(name, scene) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => {
        const buffer = Buffer.from(gltf instanceof ArrayBuffer ? gltf : gltf.buffer);
        const filePath = path.join(OUTPUT_DIR, `${name}.glb`);
        fs.writeFileSync(filePath, buffer);
        const stats = fs.statSync(filePath);
        let triCount = 0;
        scene.traverse((obj) => {
          if (obj.isMesh && obj.geometry.index) {
            triCount += obj.geometry.index.count / 3;
          } else if (obj.isMesh && obj.geometry.attributes.position) {
            triCount += obj.geometry.attributes.position.count / 3;
          }
        });
        console.log(`${name}.glb: ${triCount.toLocaleString()} tris, ${stats.size} bytes`);
        resolve({ name, triCount, size: stats.size });
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

/**
 * Torso lathe: torso + short sleeves + hem (~864 tris).
 * Hem at bind-y ≈ pelvis (0.85), neck at ~1.49.
 */
function createTopTemplate() {
  const group = new THREE.Group();
  group.name = 'topTemplate';

  const profile = [
    new THREE.Vector2(0.115, 0.0), // hem
    new THREE.Vector2(0.105, 0.13), // waist
    new THREE.Vector2(0.14, 0.3), // chest
    new THREE.Vector2(0.13, 0.42), // underarm
    new THREE.Vector2(0.175, 0.49), // shoulder
    new THREE.Vector2(0.13, 0.56), // neck base
    new THREE.Vector2(0.05, 0.6), // neck top
  ];
  const torsoGeom = new THREE.LatheGeometry(profile, 56);
  torsoGeom.translate(0, -0.3, 0);

  const sleeveGeom = new THREE.CylinderGeometry(0.055, 0.045, 0.24, 24, 2, true).translate(0.165, 0.05, 0);
  const sleeveL = sleeveGeom.clone().translate(-0.33, 0, 0);

  const mesh = new THREE.Mesh(merged([torsoGeom, sleeveGeom, sleeveL]));
  mesh.name = 'topMesh';
  group.add(mesh);
  return group;
}

/** Torso lathe: torso + full sleeves + longer hem (~1072 tris). Hem to mid-thigh. */
function createOuterwearTemplate() {
  const group = new THREE.Group();
  group.name = 'outerwearTemplate';

  const profile = [
    new THREE.Vector2(0.125, 0.0), // hem (longer)
    new THREE.Vector2(0.13, 0.18), // hip
    new THREE.Vector2(0.115, 0.32), // waist
    new THREE.Vector2(0.15, 0.5), // chest (fuller)
    new THREE.Vector2(0.14, 0.62), // underarm
    new THREE.Vector2(0.185, 0.72), // shoulder (wider)
    new THREE.Vector2(0.135, 0.8), // neck base
    new THREE.Vector2(0.055, 0.86), // neck top
  ];
  const torsoGeom = new THREE.LatheGeometry(profile, 56);
  torsoGeom.translate(0, -0.43, 0);

  const sleeveGeom = new THREE.CylinderGeometry(0.06, 0.045, 0.435, 24, 3, true).translate(0.17, 0.07, 0);
  const sleeveL = sleeveGeom.clone().translate(-0.34, 0, 0);

  const mesh = new THREE.Mesh(merged([torsoGeom, sleeveGeom, sleeveL]));
  mesh.name = 'outerwearMesh';
  group.add(mesh);
  return group;
}

/** Dress lathe: tapered waist → flared calf hem + short sleeves (~944 tris). */
function createDressTemplate() {
  const group = new THREE.Group();
  group.name = 'dressTemplate';

  const profile = [
    new THREE.Vector2(0.22, 0.0), // calf hem (flared)
    new THREE.Vector2(0.14, 0.3), // knee
    new THREE.Vector2(0.105, 0.45), // thigh
    new THREE.Vector2(0.095, 0.55), // waist (tapered)
    new THREE.Vector2(0.125, 0.7), // underarm
    new THREE.Vector2(0.165, 0.8), // shoulder
    new THREE.Vector2(0.11, 0.87), // neck base
    new THREE.Vector2(0.05, 0.93), // neck top
  ];
  const dressGeom = new THREE.LatheGeometry(profile, 56);
  dressGeom.translate(0, -0.465, 0);

  const sleeveGeom = new THREE.CylinderGeometry(0.05, 0.045, 0.2, 20, 2, true).translate(0.16, 0.235, 0);
  const sleeveL = sleeveGeom.clone().translate(-0.32, 0, 0);

  const mesh = new THREE.Mesh(merged([dressGeom, sleeveGeom, sleeveL]));
  mesh.name = 'dressMesh';
  group.add(mesh);
  return group;
}

/** Bottom: pant-leg pair + waistband + crotch, one mesh (~1036 tris). Pelvis → calf. */
function createBottomTemplate() {
  const group = new THREE.Group();
  group.name = 'bottomTemplate';

  const legGeom = new THREE.CylinderGeometry(0.065, 0.045, 0.4, 24, 4, true).translate(-0.13, 0.2, 0);
  const legR = legGeom.clone().translate(0.26, 0, 0);

  // Horizontal belt ring (torus revolved around Y).
  const waistGeom = new THREE.TorusGeometry(0.13, 0.022, 8, 40).rotateX(Math.PI / 2).translate(0, 0.4, 0);

  const crotchGeom = new THREE.BoxGeometry(0.16, 0.1, 0.12).translate(0, 0.18, 0);

  const mesh = new THREE.Mesh(merged([legGeom, legR, waistGeom, crotchGeom]));
  mesh.name = 'bottomMesh';
  group.add(mesh);
  return group;
}

/**
 * Shoes: closed-toe sneaker/loafer, one box-merged geometry cloned as
 * `shoesShell_L` / `shoesShell_R` (~508 tris each, ~1016 total). Toe toward +Z.
 */
function createShoesTemplate() {
  const group = new THREE.Group();
  group.name = 'shoesTemplate';

  const sole = new THREE.BoxGeometry(0.105, 0.03, 0.13, 8, 1, 8).translate(0, 0.015, 0);
  const upper = new THREE.BoxGeometry(0.1, 0.05, 0.13, 6, 1, 8).translate(0, 0.055, 0);
  const toe = new THREE.BoxGeometry(0.095, 0.045, 0.05, 6, 1, 6).translate(0, 0.045, 0.078);
  const heel = new THREE.BoxGeometry(0.085, 0.05, 0.045, 5, 1, 4).translate(0, 0.082, -0.055);
  const collar = new THREE.BoxGeometry(0.095, 0.03, 0.1, 5, 1, 5).translate(0, 0.105, -0.03);

  const shoeGeom = merged([sole, upper, toe, heel, collar]);

  const shoeL = new THREE.Mesh(shoeGeom);
  shoeL.name = 'shoesShell_L';
  shoeL.position.set(0.175, 0, 0.02);

  const shoeR = new THREE.Mesh(shoeGeom);
  shoeR.name = 'shoesShell_R';
  shoeR.position.set(-0.175, 0, 0.02);

  group.add(shoeL, shoeR);
  return group;
}

async function main() {
  console.log('Generating garment template GLBs...\n');

  const templates = [
    { name: 'top', create: createTopTemplate },
    { name: 'outerwear', create: createOuterwearTemplate },
    { name: 'dress', create: createDressTemplate },
    { name: 'bottom', create: createBottomTemplate },
    { name: 'shoes', create: createShoesTemplate },
  ];

  for (const t of templates) {
    const scene = t.create();
    await writeAndReport(t.name, scene);
  }

  console.log('\nDone. Templates written to:', OUTPUT_DIR);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
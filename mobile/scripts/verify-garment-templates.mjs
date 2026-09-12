#!/usr/bin/env node
/**
 * Smoke-test the 5 garment template GLBs: load each with GLTFLoader the same
 * way the app does, then report per-file tri count (true accessor count from
 * the parsed buffer — shared geometries are deduped on export), mesh names,
 * and axis-aligned bounding box in authored local space.
 *
 * Usage: node scripts/verify-garment-templates.mjs
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

const DIR = '/root/hosting/meu_guarda_roupa/mobile/assets/models/garmentTemplates';
const EXPECTED = ['top', 'outerwear', 'dress', 'bottom', 'shoes'];

const loader = new GLTFLoader();

let failed = false;

for (const name of EXPECTED) {
  const file = path.join(DIR, `${name}.glb`);
  try {
    const bytes = fs.readFileSync(file);
    const gltf = await loader.parseAsync(bytes.buffer, '');
    let triCount = 0;
    const meshes = [];
    const seen = new Set();
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        meshes.push(obj.name);
        if (!seen.has(obj.geometry.uuid)) {
          seen.add(obj.geometry.uuid);
          if (obj.geometry.index) triCount += obj.geometry.index.count / 3;
          else if (obj.geometry.attributes.position) triCount += obj.geometry.attributes.position.count / 3;
        }
      }
    });
    const box = new THREE.Box3();
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) box.expandByObject(obj);
    });
    const size = box.getSize(new THREE.Vector3());
    const ok = triCount >= 800 && triCount <= 1200 && meshes.length > 0;
    if (!ok) failed = true;
    console.log(
      `${name}: ${triCount} tris [${ok ? 'OK' : 'OUT OF RANGE'}], ` +
        `${bytes.byteLength} bytes, meshes=${JSON.stringify(meshes)}, ` +
        `bbox ${size.x.toFixed(3)}x${size.y.toFixed(3)}x${size.z.toFixed(3)}`
    );
  } catch (err) {
    failed = true;
    console.log(`${name}: LOAD FAILED`, err.message);
  }
}

process.exit(failed ? 1 : 0);
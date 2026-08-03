import * as THREE from 'three';

/**
 * A flat, transparent decal plane. The rig's one skinned mesh has no
 * separate material slot per body region (face, garments, ...), so both the
 * face texture and garment textures are applied this way instead: a plane
 * parented to the relevant bone, with `transparent: true` blending into the
 * opaque sculpted body surface behind it.
 */
export function createDecal(texture: THREE.Texture, width: number, height: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.9,
  });
  return new THREE.Mesh(geometry, material);
}

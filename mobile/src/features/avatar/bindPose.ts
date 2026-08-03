import * as THREE from 'three';

/**
 * This rig's bones all sit at local-identity transform (zero translation,
 * identity rotation) in the loaded GLB — confirmed by inspecting the file's
 * raw glTF JSON directly. The actual bind pose lives entirely in the skin's
 * `inverseBindMatrices`, not in each bone's own local TRS. That means
 * `bone.getWorldPosition()`/`bone.matrixWorld` report every bone at
 * ~world-origin — fine for posing the skinned mesh itself (GPU skinning
 * only cares about `boneMatrixWorld * boneInverse`, which stays correct
 * regardless), but useless for placing anything else parented to a bone,
 * like a decal. The real bind-pose transform has to be recovered from
 * `skeleton.boneInverses` instead — the same matrices the skinning shader
 * itself inverts to place vertices.
 */

export function findSkinnedMesh(scene: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  scene.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });
  return found;
}

/**
 * A named bone's real bind-pose position, in the same local space the
 * skinned mesh's own (unposed) geometry is authored in. Decals positioned
 * in this space and added as siblings of the mesh (not parented to the
 * bone) land in the right spot without needing the bone's own — broken —
 * live world transform at all. `null` if the bone isn't found.
 */
export function bindPosePosition(mesh: THREE.SkinnedMesh, boneName: string): THREE.Vector3 | null {
  const boneIndex = mesh.skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (boneIndex === -1) {
    return null;
  }
  const bindMatrix = mesh.skeleton.boneInverses[boneIndex].clone().invert();
  return new THREE.Vector3().setFromMatrixPosition(bindMatrix);
}

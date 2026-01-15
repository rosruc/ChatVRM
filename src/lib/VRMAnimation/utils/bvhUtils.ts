import * as THREE from "three";
import { VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * Map emotion labels to BVH file paths
 * Based on SillyTavern Extension-VRM animation mapping: DEFAULT_MOTION_MAPPING
 */
export const emotionToBVH: Record<string, string> = {
  joy: "/assets/vrm/animation/joy.bvh",
  happy: "/assets/vrm/animation/joy.bvh",
  angry: "/assets/vrm/animation/anger.bvh",
  anger: "/assets/vrm/animation/anger.bvh",
  sad: "/assets/vrm/animation/sadness.bvh",
  sadness: "/assets/vrm/animation/sadness.bvh",
  excitement: "/assets/vrm/animation/excitement.bvh",
  surprise: "/assets/vrm/animation/surprise.bvh",
  fear: "/assets/vrm/animation/fear.bvh",
  disgust: "/assets/vrm/animation/disgust.bvh",
  confusion: "/assets/vrm/animation/confusion.bvh",
  amusement: "/assets/vrm/animation/amusement.bvh",
  love: "/assets/vrm/animation/love.bvh",
  neutral: "/assets/vrm/animation/neutral_idle.bvh",
};

/**
 * Get BVH file path for an emotion label
 * @param emotion - Emotion label (case-insensitive)
 * @returns BVH file path or null if not found
 */
export function getBVHPathForEmotion(emotion: string): string | null {
  return emotionToBVH[emotion.toLowerCase()] || null;
}

/**
 * Retarget BVH animation to VRM humanoid bones
 * Based on SillyTavern Extension-VRM approach: BVH files already use VRM-compatible bone names
 *
 * @param bvhClip - The BVH animation clip to retarget
 * @param vrm - The target VRM model
 * @param bvhSkeleton - The BVH skeleton
 * @param vrmHipsHeight - The VRM model's hips height for scaling
 * @returns Retargeted animation clip compatible with VRM
 */
export function retargetBVHToVRM(
  bvhClip: THREE.AnimationClip,
  vrm: VRM,
  bvhSkeleton: THREE.Skeleton,
  vrmHipsHeight: number
): THREE.AnimationClip {
  const retargetedTracks: THREE.KeyframeTrack[] = [];

  // Calculate hips position scale for proper scaling
  const motionHipsBone = bvhSkeleton.getBoneByName("hips");
  const motionHipsHeight = motionHipsBone ? motionHipsBone.position.y : 1.0;
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  // Helper quaternions for rotation retargeting
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();

  for (const track of bvhClip.tracks) {
    // Extract bone name from track name (format: "boneName.property")
    const [bvhBoneName, property] = track.name.split(".");

    // BVH files already use VRM-compatible bone names, so use directly
    // Cast to VRMHumanBoneName type (BVH files use VRM-compatible names)
    const vrmBone = vrm.humanoid?.getNormalizedBoneNode(
      bvhBoneName as VRMHumanBoneName
    );
    if (!vrmBone) continue;

    const bvhBone = bvhSkeleton.getBoneByName(bvhBoneName);
    if (!bvhBone) continue;

    // Create new track with VRM bone name
    const newTrackName = `${vrmBone.name}.${property}`;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // Store rotations of rest-pose for retargeting
      bvhBone.getWorldQuaternion(restRotationInverse).invert();
      if (bvhBone.parent) {
        bvhBone.parent.getWorldQuaternion(parentRestWorldRotation);
      }

      // Retarget rotation: parent rest rotation * track rotation * rest rotation inverse
      const retargetedValues = [...track.values];
      for (let i = 0; i < retargetedValues.length; i += 4) {
        const flatQuaternion = retargetedValues.slice(i, i + 4);
        _quatA.fromArray(flatQuaternion);
        _quatA
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse);
        _quatA.toArray(flatQuaternion);
        flatQuaternion.forEach((v, index) => {
          retargetedValues[index + i] = v;
        });
      }

      // Apply VRM 0.x coordinate system conversion if needed
      const finalValues =
        vrm.meta?.metaVersion === "0"
          ? retargetedValues.map((v, i) => (i % 2 === 0 ? -v : v))
          : retargetedValues;

      retargetedTracks.push(
        new THREE.QuaternionKeyframeTrack(
          newTrackName,
          track.times,
          finalValues
        )
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      // Scale position values by hips height ratio and apply VRM 0.x conversion if needed
      const finalValues = track.values.map((v, i) => {
        let scaled = v * hipsPositionScale;
        if (vrm.meta?.metaVersion === "0" && i % 3 !== 1) {
          scaled = -scaled;
        }
        return scaled;
      });

      retargetedTracks.push(
        new THREE.VectorKeyframeTrack(newTrackName, track.times, finalValues)
      );
    }
  }

  return new THREE.AnimationClip(
    bvhClip.name,
    bvhClip.duration,
    retargetedTracks
  );
}

/**
 * Calculate VRM hips height for animation scaling
 * @param vrm - The VRM model
 * @returns The hips height value
 */
export function calculateVRMHipsHeight(vrm: VRM): number {
  const vrmHipsRest = vrm.humanoid?.normalizedRestPose.hips?.position;
  if (vrmHipsRest) return Math.abs(vrmHipsRest[1]);
  return 1.0;
}

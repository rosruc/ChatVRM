import * as THREE from "three";
import { BVHLoader } from "./BVHLoader";
import { VRM } from "@pixiv/three-vrm";
import { retargetBVHToVRM, calculateVRMHipsHeight } from "./utils/bvhUtils";

export interface BVHAnimationResult {
	clip: THREE.AnimationClip;
	skeleton: THREE.Skeleton;
}

/**
 * Load a BVH animation file and retarget it to VRM format
 * @param url - URL to the BVH file
 * @param vrm - The VRM model to retarget the animation to
 * @returns Retargeted animation clip compatible with VRM, or null if loading fails
 */
export async function loadBVHAnimation(
	url: string,
	vrm: VRM
): Promise<THREE.AnimationClip | null> {
	try {
		const loader = new BVHLoader();
		
		const result = await new Promise<BVHAnimationResult>((resolve, reject) => {
			loader.load(
				url,
				(result) => resolve(result),
				undefined,
				(error) => reject(error)
			);
		});

		// Retarget BVH animation to VRM humanoid bones
		const vrmHipsHeight = calculateVRMHipsHeight(vrm);
		const retargetedClip = retargetBVHToVRM(
			result.clip,
			vrm,
			result.skeleton,
			vrmHipsHeight
		);

		return retargetedClip;
	} catch (error) {
		console.error("Failed to load BVH animation:", error);
		return null;
	}
}


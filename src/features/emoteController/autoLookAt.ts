import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
/**
 * 目線を制御するクラス
 *
 * サッケードはVRMLookAtSmootherの中でやっているので、
 * より目線を大きく動かしたい場合はここに実装する。
 */
export class AutoLookAt {
  private _lookAtTarget: THREE.Object3D;
  private _vrm: VRM;
  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._vrm = vrm;
    this._lookAtTarget = new THREE.Object3D();
    this._setCamera(camera);
  }

  public setCamera(camera: THREE.Object3D) {
    this._setCamera(camera);
  }

  private _setCamera(camera: THREE.Object3D) {
    // Reparent the target to follow the current viewer camera.
    if (this._lookAtTarget.parent) {
      this._lookAtTarget.parent.remove(this._lookAtTarget);
    }
    camera.add(this._lookAtTarget);

    // Look at the camera position by default.
    this._lookAtTarget.position.set(0, 0, 0);

    const lookAt = this._vrm.lookAt as any;
    if (lookAt) {
      // Ensure VRM's lookAt system is actually running.
      // (Some apps disable autoUpdate when driving lookAt manually.)
      if (typeof lookAt.autoUpdate === "boolean") {
        lookAt.autoUpdate = true;
      }

      // This repo uses VRMLookAtSmoother, which treats:
      // - `target` as the *animation* gaze target
      // - `userTarget` as the *viewer* gaze target
      // Prefer `userTarget` when available so motions/VRMAs can't override it.
      if ("userTarget" in lookAt) {
        lookAt.userTarget = this._lookAtTarget;
      } else {
        lookAt.target = this._lookAtTarget;
      }

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("AutoLookAt(setCamera)", {
          ctorName: lookAt?.constructor?.name ?? "(unknown)",
          autoUpdate: lookAt.autoUpdate,
          usedUserTarget: "userTarget" in lookAt,
          hasUserTargetValue:
            "userTarget" in lookAt ? !!lookAt.userTarget : null,
          hasTargetValue: "target" in lookAt ? !!lookAt.target : null,
        });
      }
    }
  }
}

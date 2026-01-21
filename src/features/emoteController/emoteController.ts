import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import {
  type Emotion,
  ExpressionController,
} from "./expressionController";

/**
 * 感情表現としてExpressionとMotionを操作する為のクラス
 * デモにはExpressionのみが含まれています
 */
export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._expressionController = new ExpressionController(vrm, camera);
  }

  public setLookAtCamera(camera: THREE.Object3D) {
    this._expressionController.setLookAtCamera(camera);
  }

  public setMood(emotion: Emotion) {
    this._expressionController.setMood(emotion);
  }

  public playQuirk(
    emotion: Emotion,
    options: {
      durationSec?: number;
    } = {},
  ) {
    this._expressionController.playQuirk(emotion, options);
  }

  // Convenience helper for the common case: a single preset with constant weight.
  public playPresetQuirk(
    preset: VRMExpressionPresetName,
    options: {
      weight?: number;
      durationSec?: number;
      autoBlinkDisabled?: boolean;
    } = {},
  ) {
    const weight = Math.max(0, Math.min(1, options.weight ?? 1));
    const durationSec = Math.max(0, options.durationSec ?? 1.2);
    this.playQuirk(
      {
        waves: [
          {
            expressionName: preset,
            options: {
              minWeight: weight,
              maxWeight: weight,
            },
          },
        ],
        autoBlinkDisabled: options.autoBlinkDisabled,
      },
      { durationSec },
    );
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    this._expressionController.lipSync(preset, value);
  }

  public update(delta: number) {
    this._expressionController.update(delta);
  }
}

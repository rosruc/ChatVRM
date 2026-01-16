import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { ExpressionController } from "./expressionController";

/**
 * 感情表現としてExpressionとMotionを操作する為のクラス
 * デモにはExpressionのみが含まれています
 */
export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._expressionController = new ExpressionController(vrm, camera);
  }

  public playEmotion(preset: VRMExpressionPresetName) {
    this._expressionController.playEmotion(preset);
  }

  public playExpressionSineWave(
    expressionName: VRMExpressionPresetName | string,
    options: {
      durationSec?: number;
      minWeight?: number;
      maxWeight?: number;
      cycles?: number;
      disableAutoBlink?: boolean;
    } = {}
  ) {
    this._expressionController.playExpressionSineWave(expressionName, options);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    this._expressionController.lipSync(preset, value);
  }

  public update(delta: number) {
    this._expressionController.update(delta);
  }
}

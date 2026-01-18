import * as THREE from "three";
import {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { AutoLookAt } from "./autoLookAt";
import { AutoBlink } from "./autoBlink";

/**
 * Expressionを管理するクラス
 *
 * 主に前の表情を保持しておいて次の表情を適用する際に0に戻す作業や、
 * 前の表情が終わるまで待ってから表情適用する役割を持っている。
 */
export class ExpressionController {
  private _autoLookAt: AutoLookAt;
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentEmotion: VRMExpressionPresetName;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;

  private _moodPreset: VRMExpressionPresetName = "neutral";
  private _emotePreset: VRMExpressionPresetName | null = null;
  private _emoteWeight: number = 0;
  private _emoteTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private _emotionCurrents = new Map<string, number>();
  private _autoBlinkEnabled: boolean = true;

  private _expressionAnimationRafId: number | null = null;
  private _expressionAnimationToken = 0;
  private _expressionAnimationRestoresAutoBlink: boolean | null = null;
  private _expressionAnimationReset: {
    expressionName: VRMExpressionPresetName | string;
    minWeight: number;
  } | null = null;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentEmotion = "neutral";
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
      // // Apply the default angry expression immediately
      // this._autoBlink.setEnable(false);
      // this._expressionManager.setValue("angry", 1);
    }
  }

  public playEmotion(preset: VRMExpressionPresetName) {
    // Backward-compatible: treat playEmotion as setting the base/mood layer.
    this._moodPreset = preset;
    this._currentEmotion = preset;

    if (preset === "neutral") {
      this._autoBlink?.setEnable(true);
      this._autoBlinkEnabled = true;
    } else {
      this._autoBlink?.setEnable(false);
      this._autoBlinkEnabled = false;
    }
  }

  // A lightweight overlay layer (e.g. action reaction) that should not destroy the mood.
  // It fades out automatically after durationSec.
  public playEmote(
    preset: VRMExpressionPresetName,
    options: {
      weight?: number;
      durationSec?: number;
    } = {}
  ) {
    const weight = Math.max(0, Math.min(1, options.weight ?? 1));
    const durationSec = Math.max(0, options.durationSec ?? 1.2);

    if (this._emoteTimeoutId) {
      clearTimeout(this._emoteTimeoutId);
      this._emoteTimeoutId = null;
    }

    this._emotePreset = preset;
    this._emoteWeight = weight;

    this._emoteTimeoutId = setTimeout(() => {
      this._emotePreset = null;
      this._emoteWeight = 0;
      this._emoteTimeoutId = null;
    }, Math.ceil(durationSec * 1000));
  }

  public stopExpressionAnimation() {
    if (this._expressionAnimationRafId != null) {
      cancelAnimationFrame(this._expressionAnimationRafId);
      this._expressionAnimationRafId = null;
    }
    this._expressionAnimationToken++;

    if (this._expressionAnimationReset && this._expressionManager) {
      try {
        this._expressionManager.setValue(
          this._expressionAnimationReset.expressionName as any,
          this._expressionAnimationReset.minWeight
        );
        this._expressionManager.update();
      } catch {
        // ignore
      }
    }
    this._expressionAnimationReset = null;

    if (this._expressionAnimationRestoresAutoBlink != null) {
      this._autoBlink?.setEnable(this._expressionAnimationRestoresAutoBlink);
      this._expressionAnimationRestoresAutoBlink = null;
    }
  }

  // Plays an expression weight animation from min -> max -> min.
  // Works with both preset names (e.g. "happy") and custom expression keys.
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
    const manager = this._expressionManager;
    if (!manager) return;

    this.stopExpressionAnimation();

    const durationSec = Math.max(0.05, options.durationSec ?? 0.8);
    const minWeightRaw = options.minWeight ?? 0;
    const maxWeightRaw = options.maxWeight ?? 1;
    const minWeight = Math.min(
      1,
      Math.max(0, Math.min(minWeightRaw, maxWeightRaw))
    );
    const maxWeight = Math.min(
      1,
      Math.max(0, Math.max(minWeightRaw, maxWeightRaw))
    );

    const cyclesOption = options.cycles ?? 1;
    const cycles =
      cyclesOption === -1 ? -1 : Math.max(1, Math.floor(cyclesOption));
    const disableAutoBlink = options.disableAutoBlink ?? true;

    if (disableAutoBlink && this._autoBlink) {
      // Track the previous state so we can restore on finish/cancel.
      this._expressionAnimationRestoresAutoBlink =
        this._currentEmotion === "neutral";
      this._autoBlink.setEnable(false);
    }

    // Start from min for a consistent "pulse".
    try {
      manager.setValue(expressionName as any, minWeight);
      manager.update();
    } catch {
      // Ignore invalid expression keys.
      this._expressionAnimationRestoresAutoBlink = null;
      return;
    }

    this._expressionAnimationReset = { expressionName, minWeight };

    const token = ++this._expressionAnimationToken;
    const startMs = performance.now();

    const tick = (nowMs: number) => {
      if (token !== this._expressionAnimationToken) return;
      const elapsedSec = (nowMs - startMs) / 1000;

      // For cycles === -1, durationSec is treated as "seconds per cycle".
      // For finite cycles, durationSec is treated as total animation duration.
      const normalized = elapsedSec / durationSec;
      const t = cycles === -1 ? normalized % 1 : Math.min(1, normalized);
      const cycleCount = cycles === -1 ? 1 : cycles;

      // min -> max -> min
      // w = min + (max-min) * 0.5 * (1 - cos(2π * cycles * t))
      const phase = 2 * Math.PI * cycleCount * t;
      const weight =
        minWeight + (maxWeight - minWeight) * 0.5 * (1 - Math.cos(phase));

      try {
        manager.setValue(expressionName as any, weight);
        manager.update();
      } catch {
        // If the expression disappears mid-animation, just stop.
        this.stopExpressionAnimation();
        return;
      }

      if (cycles !== -1 && t >= 1) {
        try {
          manager.setValue(expressionName as any, minWeight);
          manager.update();
        } finally {
          if (this._expressionAnimationRestoresAutoBlink != null) {
            this._autoBlink?.setEnable(
              this._expressionAnimationRestoresAutoBlink
            );
            this._expressionAnimationRestoresAutoBlink = null;
          }
          this._expressionAnimationRafId = null;
          this._expressionAnimationReset = null;
        }
        return;
      }

      this._expressionAnimationRafId = requestAnimationFrame(tick);
    };

    this._expressionAnimationRafId = requestAnimationFrame(tick);
  }

  public lipSync(preset: VRMExpressionPresetName, value: number) {
    // let expressions = this._expressionManager?.getExpressions();
    // console.log(expressions);

    // let expression = this._expressionManager?.getExpression("MouthPucker");
    //console.log(expression);

    if (this._currentLipSync) {
      this._expressionManager?.setValue(this._currentLipSync.preset, 0);
    }
    this._currentLipSync = {
      preset,
      value,
    };
  }

  public update(delta: number) {
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    // --- emotion layers (mood + emote)
    const manager = this._expressionManager;
    if (manager) {
      // Compute per-expression targets.
      const targets = new Map<string, number>();

      if (this._moodPreset && this._moodPreset !== "neutral") {
        targets.set(this._moodPreset, 1);
      }
      if (this._emotePreset && this._emoteWeight > 0) {
        const prev = targets.get(this._emotePreset) ?? 0;
        targets.set(this._emotePreset, Math.min(1, prev + this._emoteWeight));
      }

      // AutoBlink: disable only when mood/emote is active.
      const shouldEnableBlink = targets.size === 0;
      if (shouldEnableBlink !== this._autoBlinkEnabled) {
        this._autoBlink?.setEnable(shouldEnableBlink);
        this._autoBlinkEnabled = shouldEnableBlink;
      }

      // Smoothly approach targets.
      const tau = 0.12; // seconds (smaller = snappier)
      const alpha = 1 - Math.exp(-delta / tau);

      // If playExpressionSineWave is running, don't override that expression key.
      const reservedKey = this._expressionAnimationReset?.expressionName;

      const keys = new Set<string>([
        ...this._emotionCurrents.keys(),
        ...targets.keys(),
      ]);
      for (const key of keys) {
        if (reservedKey && key === reservedKey) {
          continue;
        }

        const current = this._emotionCurrents.get(key) ?? 0;
        const target = targets.get(key) ?? 0;
        const next = current + (target - current) * alpha;

        if (next <= 0.001 && target <= 0.001) {
          if (current > 0) {
            manager.setValue(key as any, 0);
          }
          this._emotionCurrents.delete(key);
          continue;
        }

        this._emotionCurrents.set(key, next);
        manager.setValue(key as any, Math.max(0, Math.min(1, next)));
      }
    }

    if (this._currentLipSync) {
      const hasEmotion = this._moodPreset !== "neutral" || this._emotePreset;
      const weight = !hasEmotion
        ? this._currentLipSync.value * 0.5
        : this._currentLipSync.value * 0.25;
      this._expressionManager?.setValue(this._currentLipSync.preset, weight);
    }
  }
}

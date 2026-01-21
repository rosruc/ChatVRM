import * as THREE from "three";
import {
  VRM,
  VRMExpressionManager,
  VRMExpressionPresetName,
  VRMLookAtExpressionApplier,
} from "@pixiv/three-vrm";
import { AutoLookAt } from "./autoLookAt";
import { AutoBlink } from "./autoBlink";

export type EmotionSineWaveOptions = {
  durationSec?: number;
  minWeight?: number;
  maxWeight?: number;
  cycles?: number;
};

export type EmotionWave = {
  expressionName: VRMExpressionPresetName;
  options?: EmotionSineWaveOptions;
};

export type Emotion = {
  waves: EmotionWave[];
  autoBlinkDisabled?: boolean;
};

/**
 * Expressionを管理するクラス
 */
export class ExpressionController {
  private _autoLookAt: AutoLookAt;
  private _autoBlink?: AutoBlink;
  private _expressionManager?: VRMExpressionManager;
  private _currentLipSync: {
    preset: VRMExpressionPresetName;
    value: number;
  } | null;

  private _mood: Emotion = { waves: [{ expressionName: "neutral" }] };
  private _moodStartMs: number | null = null;

  private _quirk: Emotion = { waves: [{ expressionName: "neutral" }] };
  private _quirkStartMs: number | null = null;
  private _quirkEndMs: number | null = null;

  private _emotionCurrents = new Map<string, number>();

  private _autoBlinkEnabled = true;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._autoLookAt = new AutoLookAt(vrm, camera);
    this._currentLipSync = null;
    if (vrm.expressionManager) {
      this._expressionManager = vrm.expressionManager;
      this._autoBlink = new AutoBlink(vrm.expressionManager);
      this._autoBlink.setEnable(true);
      // // Apply the default angry expression immediately
      // this._autoBlink.setEnable(false);
      // this._expressionManager.setValue("angry", 1);
    }
  }

  private static _calcSineWaveWeight(
    elapsedSec: number,
    durationSec: number,
    minWeight: number,
    maxWeight: number,
    cycles: number,
  ): number {
    // Semantics:
    // - cycles === -1: durationSec is seconds-per-cycle and loops forever.
    // - cycles >= 1: durationSec is total duration and returns to min at the end.
    const normalized = elapsedSec / durationSec;
    const t =
      cycles === -1 ? ((normalized % 1) + 1) % 1 : Math.min(1, normalized);
    const cycleCount = cycles === -1 ? 1 : cycles;

    // min -> max -> min
    // w = min + (max-min) * 0.5 * (1 - cos(2π * cycles * t))
    const phase = 2 * Math.PI * cycleCount * t;
    return minWeight + (maxWeight - minWeight) * 0.5 * (1 - Math.cos(phase));
  }

  private static _normalizeMoodWave(
    expressionName: VRMExpressionPresetName,
    options?: EmotionSineWaveOptions,
  ) {
    // If options are omitted, treat it as a constant weight that loops forever.
    // Default to 1.0 so a single wave behaves like "full expression".
    const durationSec = Math.max(0.05, options?.durationSec ?? 1.0);
    const minWeightRaw =
      options == null ? 1 : options.minWeight ?? options.maxWeight ?? 0;
    const maxWeightRaw =
      options == null
        ? 1
        : options.maxWeight ?? options.minWeight ?? minWeightRaw;
    const minWeight = Math.min(
      1,
      Math.max(0, Math.min(minWeightRaw, maxWeightRaw)),
    );
    const maxWeight = Math.min(
      1,
      Math.max(0, Math.max(minWeightRaw, maxWeightRaw)),
    );
    const cyclesOption = options?.cycles ?? -1;
    const cycles =
      cyclesOption === -1 ? -1 : Math.max(1, Math.floor(cyclesOption));
    return { expressionName, durationSec, minWeight, maxWeight, cycles };
  }

  private static _effectiveWaves(emotion: Emotion): EmotionWave[] {
    // We allow a convenient sentinel: waves: [{ expressionName: "neutral" }]
    // which is treated as "no mood/quirk".
    return emotion.waves.filter((w) => w.expressionName !== "neutral");
  }

  public setLookAtCamera(camera: THREE.Object3D) {
    this._autoLookAt.setCamera(camera);
  }

  public setMood(emotion: Emotion) {
    const nowMs = performance.now();

    this._mood = emotion;
    const effective = ExpressionController._effectiveWaves(emotion);
    if (effective.length === 0) {
      this._moodStartMs = null;
      return;
    }

    this._moodStartMs = nowMs;
  }

  // A lightweight overlay layer (e.g. action reaction) that should not destroy the mood.
  // It fades out automatically after durationSec.
  public playQuirk(
    emotion: Emotion,
    options: {
      durationSec?: number;
    } = {},
  ) {
    const nowMs = performance.now();

    this._quirk = emotion;
    const effective = ExpressionController._effectiveWaves(emotion);
    if (effective.length === 0) {
      this._quirkStartMs = null;
      this._quirkEndMs = null;
      return;
    }

    this._quirkStartMs = nowMs;

    const durationSec = options.durationSec;
    if (durationSec == null) {
      this._quirkEndMs = null;
    } else {
      const d = Math.max(0, durationSec);
      this._quirkEndMs = d === 0 ? nowMs : nowMs + d * 1000;
    }
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
    const nowMs = performance.now();

    // --- emotion layers (mood + quirk)
    const manager = this._expressionManager;
    if (manager) {
      // Compute per-expression targets.
      const targets = new Map<string, number>();

      if (this._moodStartMs != null) {
        const elapsedSec = (nowMs - this._moodStartMs) / 1000;
        const waves = ExpressionController._effectiveWaves(this._mood);
        for (const wave of waves) {
          const w = ExpressionController._normalizeMoodWave(
            wave.expressionName,
            wave.options,
          );
          const weight = ExpressionController._calcSineWaveWeight(
            elapsedSec,
            w.durationSec,
            w.minWeight,
            w.maxWeight,
            w.cycles,
          );
          const prev = targets.get(w.expressionName) ?? 0;
          targets.set(w.expressionName, Math.min(1, prev + weight));
        }
      }

      // Quirk layer.
      if (this._quirkStartMs != null) {
        if (this._quirkEndMs != null && nowMs >= this._quirkEndMs) {
          this._quirk = { waves: [{ expressionName: "neutral" }] };
          this._quirkStartMs = null;
          this._quirkEndMs = null;
        } else {
          const elapsedSec = (nowMs - this._quirkStartMs) / 1000;
          const waves = ExpressionController._effectiveWaves(this._quirk);
          for (const wave of waves) {
            const w = ExpressionController._normalizeMoodWave(
              wave.expressionName,
              wave.options,
            );
            const weight = ExpressionController._calcSineWaveWeight(
              elapsedSec,
              w.durationSec,
              w.minWeight,
              w.maxWeight,
              w.cycles,
            );
            const prev = targets.get(w.expressionName) ?? 0;
            targets.set(w.expressionName, Math.min(1, prev + weight));
          }
        }
      }

      // Smoothly approach targets.
      const tau = 0.12; // seconds (smaller = snappier)
      const alpha = 1 - Math.exp(-delta / tau);

      const keys = new Set<string>([
        ...this._emotionCurrents.keys(),
        ...targets.keys(),
      ]);
      for (const key of keys) {
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

    // Auto blink enable/disable is driven by active emotion layers.
    // If an active layer requests autoBlinkDisabled, we disable it.
    const moodActive =
      this._moodStartMs != null &&
      ExpressionController._effectiveWaves(this._mood).length > 0;
    const quirkActive =
      this._quirkStartMs != null &&
      ExpressionController._effectiveWaves(this._quirk).length > 0;

    const moodDisablesBlink = moodActive
      ? this._mood.autoBlinkDisabled === true
      : false;
    const quirkDisablesBlink = quirkActive
      ? this._quirk.autoBlinkDisabled === true
      : false;

    const desiredAutoBlinkEnabled = !(moodDisablesBlink || quirkDisablesBlink);
    if (this._autoBlink && desiredAutoBlinkEnabled !== this._autoBlinkEnabled) {
      this._autoBlinkEnabled = desiredAutoBlinkEnabled;
      this._autoBlink.setEnable(desiredAutoBlinkEnabled);
    }

    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    if (this._currentLipSync) {
      const hasEmotion =
        this._moodStartMs != null || this._quirkStartMs != null;
      const weight = !hasEmotion
        ? this._currentLipSync.value * 0.5
        : this._currentLipSync.value * 0.25;
      this._expressionManager?.setValue(this._currentLipSync.preset, weight);
    }
  }
}

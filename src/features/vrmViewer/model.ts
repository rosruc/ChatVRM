import * as THREE from "three";
import {
  VRM,
  VRMExpressionPresetName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "../../lib/VRMAnimation/VRMAnimation";
import { loadBVHAnimation as loadBVHAnimationFile } from "../../lib/VRMAnimation/loadBVHAnimation";
import { getBVHPathForEmotion } from "../../lib/VRMAnimation/utils/bvhUtils";
import { buildUrl } from "@/utils/buildUrl";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "../lipSync/lipSync";
import { EmoteController } from "../emoteController/emoteController";
import { Screenplay } from "../messages/messages";
import { getAnimationPath } from "../../lib/VRMAnimation/utils/animationMapping";

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public emoteController?: EmoteController;

  private _lookAtTargetParent: THREE.Object3D;
  private _lipSync?: LipSync;
  private _idleAction?: THREE.AnimationAction;
  private _idleUrl: string | null = null;
  private _currentBVHAction?: THREE.AnimationAction;
  private _currentVRMAAction?: THREE.AnimationAction;

  private _currentActionFinishedListener?: (e: any) => void;
  private _resolveCurrentActionPromise?: () => void;
  private _stopTimeoutId?: ReturnType<typeof setTimeout>;

  private prevPlayedEmotion: string | null = null;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  private _resolveEmotionPreset(
    emotion: Screenplay["expression"]
  ): VRMExpressionPresetName {
    // Map custom / non-standard tags to a real VRM preset.
    // (Keeps EmoteController strict and avoids missing-expression runtime issues.)
    if (emotion === "rapture") return "surprised";

    // Screenplay.expression can already be a VRMExpressionPresetName.
    // For any unknown custom string, fall back to neutral.
    const preset = emotion as VRMExpressionPresetName;
    return preset ?? "neutral";
  }

  private _stopActionWithFade(
    action: THREE.AnimationAction,
    fadeOutSeconds: number
  ): void {
    if (fadeOutSeconds > 0) {
      action.fadeOut(fadeOutSeconds);
      this._stopTimeoutId = setTimeout(() => {
        action.enabled = false;
        action.setEffectiveWeight(0);
        action.stop();
      }, Math.ceil(fadeOutSeconds * 1000) + 50);
    } else {
      action.enabled = false;
      action.setEffectiveWeight(0);
      action.stop();
    }
  }

  private _ensureIdleRunning(): void {
    const idle = this._idleAction;
    if (!idle) return;
    if (!idle.isRunning()) {
      idle.enabled = true;
      idle.reset().play();
      idle.setEffectiveWeight(1.0);
    }
  }

  private _duckIdle(): void {
    const idle = this._idleAction;
    if (!idle) return;
    this._ensureIdleRunning();
    // Make idle non-contributing immediately to avoid constraints.
    idle.setEffectiveWeight(0);
  }

  private _fadeInIdle(fadeSeconds: number): void {
    const idle = this._idleAction;
    if (!idle) return;
    idle.enabled = true;
    idle.setEffectiveWeight(1.0);
    idle.reset();
    if (fadeSeconds > 0) {
      idle.fadeIn(fadeSeconds);
    }
    idle.play();
  }

  private _getActiveBodyAction(): THREE.AnimationAction | null {
    const bvh = this._currentBVHAction;
    if (bvh && bvh.isRunning()) return bvh;
    const vrma = this._currentVRMAAction;
    if (vrma && vrma.isRunning()) return vrma;
    const idle = this._idleAction;
    if (idle && idle.isRunning()) return idle;
    return null;
  }

  private _crossfadeToAction(
    fromAction: THREE.AnimationAction | null,
    toAction: THREE.AnimationAction,
    fadeSeconds: number
  ): void {
    if (fadeSeconds > 0 && fromAction && fromAction.isRunning()) {
      fromAction.crossFadeTo(toAction, fadeSeconds, false);

      // If we're fading from a one-shot motion, stop it after the transition so it
      // can't keep contributing (constraint) via clampWhenFinished.
      if (fromAction !== this._idleAction) {
        setTimeout(() => {
          fromAction.enabled = false;
          fromAction.setEffectiveWeight(0);
          fromAction.stop();
        }, Math.ceil(fadeSeconds * 1000) + 60);
      }
    } else if (fadeSeconds > 0) {
      toAction.fadeIn(fadeSeconds);
    }

    toAction.play();
  }

  private _returnToIdle(
    fromAction: THREE.AnimationAction | null,
    fadeSeconds: number
  ): void {
    // Start idle first so we never show bind/T-pose.
    this._fadeInIdle(fadeSeconds);

    if (!fromAction) return;
    // Ensure finished actions don't freeze the model at the last frame.
    this._stopActionWithFade(fromAction, fadeSeconds);
  }

  private _beginNewBodyAction(): void {
    // Keep idle running at weight 0 so it doesn't constrain the motion.
    // Motion actions will be started after this.
    this._duckIdle();
  }

  private _cancelBodyTimersAndWaiters(): void {
    this._clearActionWaiter();
    if (this._stopTimeoutId) {
      clearTimeout(this._stopTimeoutId);
      this._stopTimeoutId = undefined;
    }
  }

  private _clearActionWaiter(): void {
    if (this._resolveCurrentActionPromise) {
      this._resolveCurrentActionPromise();
      this._resolveCurrentActionPromise = undefined;
    }

    if (this._currentActionFinishedListener && this.mixer) {
      this.mixer.removeEventListener(
        "finished",
        this._currentActionFinishedListener as any
      );
    }
    this._currentActionFinishedListener = undefined;
  }

  private _interruptBodyAnimations(fadeOutSeconds: number = 0.2): void {
    this._clearActionWaiter();

    if (this._stopTimeoutId) {
      clearTimeout(this._stopTimeoutId);
      this._stopTimeoutId = undefined;
    }

    if (this._currentBVHAction) {
      this._stopActionWithFade(this._currentBVHAction, fadeOutSeconds);
      this._currentBVHAction = undefined;
    }

    if (this._currentVRMAAction) {
      // VRMA is typically short; stop immediately to avoid pose accumulation.
      this._currentVRMAAction.enabled = false;
      this._currentVRMAAction.setEffectiveWeight(0);
      this._currentVRMAAction.stop();
      this._currentVRMAAction = undefined;
    }
  }

  private _playIdleIfPossible(): void {
    if (!this._idleAction) return;
    if (this._currentBVHAction || this._currentVRMAAction) return;

    // Always restart idle here because it might still be "running" at weight=0
    // after fades; restarting is the simplest way to guarantee the pose.
    this._idleAction.enabled = true;
    this._idleAction.setEffectiveWeight(1.0);
    this._idleAction.reset().fadeIn(0.5).play();
  }

  private async _setIdleAnimation(
    url: string,
    loop: boolean = true
  ): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) return;

    this._idleUrl = url;
    const clip = await loadBVHAnimationFile(buildUrl(url), vrm);
    if (!clip) {
      console.warn(`Failed to load idle animation: ${url}`);
      return;
    }

    const action = mixer.clipAction(clip);
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1
    );
    action.enabled = true;
    action.setEffectiveWeight(1.0);
    this._idleAction = action;

    // Start idle immediately so we never fall back to bind pose.
    this._ensureIdleRunning();
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        })
    );

    const gltf = await loader.loadAsync(url);

    const vrm = (this.vrm = gltf.userData.vrm);
    vrm.scene.name = "VRMRoot";

    // log all info about vrm, including blend shapes and expressions
    console.log(vrm);

    VRMUtils.rotateVRM0(vrm);
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);

    // Set default idle animation
    await this._setIdleAnimation(
      "/assets/vrm/animation/bvh/neutral_idle.bvh",
      true
    );
  }

  public unLoadVrm() {
    if (this.vrm) {
      this._clearActionWaiter();

      // Stop any playing VRMA animation
      if (this._currentVRMAAction) {
        this._currentVRMAAction.stop();
        this._currentVRMAAction = undefined;
      }

      if (this._currentBVHAction) {
        this._currentBVHAction.stop();
        this._currentBVHAction = undefined;
      }

      if (this._idleAction) {
        this._idleAction.stop();
        this._idleAction = undefined;
      }

      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
  }

  /**
   * Stop all animations (animation queue and VRMA)
   */
  public stopAllAnimations(): void {
    this._interruptBodyAnimations(0);
    this.mixer?.stopAllAction();
    this._ensureIdleRunning();
    this._fadeInIdle(0.2);
  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const fromAction = this._getActiveBodyAction();
    this._cancelBodyTimersAndWaiters();

    // Stop any non-primary body action we track (keep idle running).
    if (this._currentBVHAction && this._currentBVHAction !== fromAction) {
      this._stopActionWithFade(this._currentBVHAction, 0.05);
      this._currentBVHAction = undefined;
    }
    if (this._currentVRMAAction && this._currentVRMAAction !== fromAction) {
      this._currentVRMAAction.stop();
      this._currentVRMAAction = undefined;
    }

    const clip = vrmAnimation.createAnimationClip(vrm);
    const action = mixer.clipAction(clip);

    // Properly configure and reset the action
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1.0);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;

    this._currentVRMAAction = action;

    // Smoothly transition from idle/previous motion into VRMA.
    this._crossfadeToAction(fromAction, action, 0.2);

    // Return to idle when the one-shot VRMA finishes.
    this._clearActionWaiter();
    const finishedListener = (e: any) => {
      if (e?.action !== action) return;
      mixer.removeEventListener("finished", finishedListener as any);
      if (this._currentVRMAAction === action) {
        this._currentVRMAAction = undefined;
        this._returnToIdle(action, 0.2);
      }
    };
    this._currentActionFinishedListener = finishedListener;
    mixer.addEventListener("finished", finishedListener as any);
  }

  /**
   * BVHアニメーションを読み込んで再生する
   *
   * @param url - BVHファイルのURL
   * @param loop - ループ再生するかどうか（デフォルト: false）
   * @returns アニメーションアクション、またはnull（読み込み失敗時）
   */
  public async loadBVHAnimation(
    url: string,
    loop: boolean = false
  ): Promise<THREE.AnimationAction | null> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip = await loadBVHAnimationFile(url, vrm);
    if (!clip) {
      return null;
    }

    const fromAction = this._getActiveBodyAction();
    this._cancelBodyTimersAndWaiters();

    // Stop any non-primary body action we track (keep idle running).
    if (this._currentBVHAction && this._currentBVHAction !== fromAction) {
      this._stopActionWithFade(this._currentBVHAction, 0.05);
      this._currentBVHAction = undefined;
    }
    if (this._currentVRMAAction && this._currentVRMAAction !== fromAction) {
      this._currentVRMAAction.stop();
      this._currentVRMAAction = undefined;
    }
    // If we're coming from a motion (not idle), make idle non-contributing immediately.
    if (fromAction !== this._idleAction) {
      this._duckIdle();
    }

    const action = mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1.0);
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
    }
    action.play();

    // Keep final pose until we crossfade back to idle.
    action.clampWhenFinished = true;

    this._currentBVHAction = action;

    // Smoothly transition from idle/previous motion into this BVH.
    this._crossfadeToAction(fromAction, action, 0.2);

    if (!loop) {
      const fadeOut = 0.25;

      // When the one-shot ends, fade idle in and stop the finished action.
      const finishedListener = (e: any) => {
        if (e?.action !== action) return;
        mixer.removeEventListener("finished", finishedListener as any);
        if (this._currentBVHAction === action) {
          this._currentBVHAction = undefined;
        }
        this._returnToIdle(action, fadeOut);
      };
      this._currentActionFinishedListener = finishedListener;
      mixer.addEventListener("finished", finishedListener as any);
    }

    return action;
  }

  /**
   * 感情に基づいてBVHアニメーションを読み込んで再生する
   *
   * @param emotion - 感情ラベル（例: "happy", "sad", "angry"）
   * @param loop - ループ再生するかどうか（デフォルト: false）
   * @returns アニメーションアクション、またはnull（読み込み失敗時）
   */
  public async loadBVHAnimationForEmotion(
    emotion: string,
    loop: boolean = false
  ): Promise<THREE.AnimationAction | null> {
    const bvhPath = getBVHPathForEmotion(emotion);
    if (!bvhPath) {
      console.warn(`No BVH animation found for emotion: ${emotion}`);
      return null;
    }

    // return this.loadBVHAnimation(bvhPath, loop);

    return this.loadBVHAnimation(buildUrl(bvhPath), loop);
  }

  /**
   * 音声を再生し、リップシンクを行う
   * Also triggers body animations based on screenplay motion/expression
   */
  public async speak(buffer: ArrayBuffer | null, screenplay: Screenplay) {
    const emotionPreset = this._resolveEmotionPreset(screenplay.expression);

    // Play body animation if motion is specified, otherwise use expression-based animation
    if (screenplay.motion) {
      // Set expression when animation starts
      this.emoteController?.playEmotion(emotionPreset);
      this.prevPlayedEmotion = emotionPreset;

      await this.playAnimation(screenplay.motion, {
        loop: false,
        fadeIn: 0.3,
        fadeOut: 0.3,
        onStart: () => {
          // Ensure expression is set when animation starts
          this.emoteController?.playEmotion(emotionPreset);
          this.prevPlayedEmotion = emotionPreset;
        },
        onComplete: () => {
          // Return to neutral expression after animation completes
          this.emoteController?.playEmotion("neutral");
          this.prevPlayedEmotion = "neutral";
        },
      });
    } else if (emotionPreset !== "neutral") {
      // Set expression when animation starts
      this.emoteController?.playEmotion(emotionPreset);
      this.prevPlayedEmotion = emotionPreset;

      // Fallback: play emotion-based animation for non-neutral expressions
      await this.playAnimation(screenplay.expression, {
        loop: false,
        fadeIn: 0.3,
        fadeOut: 0.3,
        onStart: () => {
          // Ensure expression is set when animation starts
          this.emoteController?.playEmotion(emotionPreset);
          this.prevPlayedEmotion = emotionPreset;
        },
        onComplete: () => {
          // Return to neutral expression after animation completes
          this.emoteController?.playEmotion("neutral");
          this.prevPlayedEmotion = "neutral";
        },
      });
    } else {
      // For neutral, just set expression without animation
      this.emoteController?.playEmotion("neutral");
      this.prevPlayedEmotion = "neutral";
    }

    if (!buffer) {
      return;
    }

    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      });
    });
  }

  /**
   * Play animation with sequencing support
   * Returns a Promise that resolves when the animation completes
   */
  public async playAnimation(
    emotionOrAction: string,
    options: {
      loop?: boolean;
      fadeIn?: number;
      fadeOut?: number;
      priority?: number;
      onStart?: () => void;
      onComplete?: () => void;
    } = {}
  ): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      console.warn("VRM not initialized");
      return;
    }

    const animationPath = getAnimationPath(emotionOrAction);
    if (!animationPath) {
      console.warn(`No animation found for: ${emotionOrAction}`);
      return;
    }

    const fromAction = this._getActiveBodyAction();
    this._cancelBodyTimersAndWaiters();

    const clip = await loadBVHAnimationFile(buildUrl(animationPath), vrm);
    if (!clip) {
      console.warn(`Failed to load animation: ${animationPath}`);
      return;
    }

    // Stop any non-primary body action we track (keep idle running).
    if (this._currentBVHAction && this._currentBVHAction !== fromAction) {
      this._stopActionWithFade(this._currentBVHAction, 0.05);
      this._currentBVHAction = undefined;
    }
    if (this._currentVRMAAction && this._currentVRMAAction !== fromAction) {
      this._currentVRMAAction.stop();
      this._currentVRMAAction = undefined;
    }
    if (fromAction !== this._idleAction) {
      this._duckIdle();
    }

    const action = mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1.0);

    const loop = options.loop ?? false;
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1
    );
    action.clampWhenFinished = true;

    this._currentBVHAction = action;
    options.onStart?.();

    const fadeIn = options.fadeIn ?? 0.3;
    this._crossfadeToAction(fromAction, action, fadeIn);

    // Looping animations resolve after a small minimum duration.
    if (loop) {
      await new Promise((r) => setTimeout(r, 2000));
      return;
    }

    const fadeOut = options.fadeOut ?? 0.3;

    await new Promise<void>((resolve) => {
      const safetyTimeoutMs = 10000;
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, safetyTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (this._currentActionFinishedListener) {
          mixer.removeEventListener(
            "finished",
            this._currentActionFinishedListener as any
          );
          this._currentActionFinishedListener = undefined;
        }
        this._resolveCurrentActionPromise = undefined;
      };

      this._resolveCurrentActionPromise = () => {
        cleanup();
        resolve();
      };

      const finishedListener = (e: any) => {
        if (e?.action !== action) return;
        cleanup();
        resolve();
      };

      this._currentActionFinishedListener = finishedListener;
      mixer.addEventListener("finished", finishedListener as any);
    });

    // Fade back to idle and stop the action (prevents freezing on last frame).
    if (this._currentBVHAction === action) {
      this._currentBVHAction = undefined;
    }
    this._returnToIdle(action, fadeOut);
    options.onComplete?.();
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update();

      // variable for expression controller
      let expression = this.vrm?.expressionManager?.getExpression("JawOpen");
      if (expression) {
        // handle Perfect Sync standard

        // @ts-ignore
        this.emoteController?.lipSync("JawOpen", volume);
        // this.emoteController?.lipSync("MouthStretch", 0.4 * volume);
      } else {
        this.emoteController?.lipSync("aa", volume);
      }
    }

    this.emoteController?.update(delta);
    this.mixer?.update(delta);
    this.vrm?.update(delta);
  }
}

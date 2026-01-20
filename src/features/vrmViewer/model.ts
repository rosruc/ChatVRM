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
  private _stopTimeoutId?: ReturnType<typeof setTimeout>;

  private prevPlayedEmotion: string | null = null;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public setLookAtTargetParent(parent: THREE.Object3D) {
    this._lookAtTargetParent = parent;
    this.emoteController?.setLookAtCamera(parent);
  }

  private _resolvePublicPathOrUrl(url: string): string {
    // Allow callers to pass either a public asset path ("/assets/...")
    // or a fully resolved URL.
    return url.startsWith("/") ? buildUrl(url) : url;
  }

  private _resolveEmotionPreset(
    emotion: Screenplay["expression"],
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
    fadeOutSeconds: number,
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
    // IMPORTANT: don't reset a running state/baseline action.
    // Resetting can briefly evaluate the bind pose (T-pose) at time=0.
    if (!idle.isRunning()) {
      idle.reset();
    }
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
    fadeSeconds: number,
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
    fadeSeconds: number,
  ): void {
    // Start idle first so we never show bind/T-pose.
    this._fadeInIdle(fadeSeconds);

    if (!fromAction) return;
    // Ensure finished actions don't freeze the model at the last frame.
    this._stopActionWithFade(fromAction, fadeSeconds);
  }
  private _cancelBodyTimersAndWaiters(): void {
    this._clearActionWaiter();
    if (this._stopTimeoutId) {
      clearTimeout(this._stopTimeoutId);
      this._stopTimeoutId = undefined;
    }
  }

  private _clearActionWaiter(): void {
    if (this._currentActionFinishedListener && this.mixer) {
      this.mixer.removeEventListener(
        "finished",
        this._currentActionFinishedListener as any,
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
      // Fade out VRMA too (mirrors BVH) to avoid a single-frame bind/T-pose flash
      // when transitioning from a VRMA quirk into a new state motion.
      this._stopActionWithFade(this._currentVRMAAction, fadeOutSeconds);
      this._currentVRMAAction = undefined;
    }
  }

  /**
   * Prepare for switching into a new long-lived state motion.
   * This immediately interrupts any currently playing one-shot body motion
   * and brings the current baseline back so we don't sit at a clamped pose
   * while the next state asset is loading.
   */
  public beginStateTransition(fadeSeconds: number = 0.12): void {
    this._interruptBodyAnimations(fadeSeconds);
    this._ensureIdleRunning();

    const idle = this._idleAction;
    if (!idle) return;

    // If the baseline is already contributing, don't call fadeIn().
    // fadeIn() ramps from 0→1 and can briefly expose bind pose during state→state.
    if (idle.isRunning() && idle.getEffectiveWeight() > 0.01) {
      idle.enabled = true;
      idle.setEffectiveWeight(1.0);
      idle.play();
      return;
    }

    this._fadeInIdle(fadeSeconds);
  }

  private async _setIdleAnimation(
    url: string,
    loop: boolean = true,
    fadeSeconds: number = 0.2,
  ): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) return;

    this._idleUrl = url;
    const resolvedUrl = this._resolvePublicPathOrUrl(url);
    const clip = await loadBVHAnimationFile(resolvedUrl, vrm);
    if (!clip) {
      console.warn(`Failed to load idle animation: ${url}`);
      return;
    }

    const prevIdle = this._idleAction;
    const action = mixer.clipAction(clip);
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.enabled = true;
    action.setEffectiveWeight(1.0);
    this._idleAction = action;

    // Start idle immediately so we never fall back to bind pose.
    // If we had a previous idle running, crossfade to avoid popping.
    if (
      fadeSeconds > 0 &&
      prevIdle &&
      prevIdle !== action &&
      prevIdle.isRunning()
    ) {
      this._crossfadeToAction(prevIdle, action, fadeSeconds);
    } else {
      this._ensureIdleRunning();
    }
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        }),
    );

    const gltf = await loader.loadAsync(url);

    const vrm = (this.vrm = gltf.userData.vrm);
    vrm.scene.name = "VRMRoot";

    if (!vrm.lookAt) {
      console.warn(
        "VRM.lookAt was not created by the loader. Look-at will be disabled.",
      );
    } else {
      // Debug: confirm which lookAt implementation is active and enable debug logs
      // when using our VRMLookAtSmoother wrapper.
      const lookAt: any = vrm.lookAt;
      const ctorName = lookAt?.constructor?.name ?? "(unknown)";
      console.log("VRM.lookAt attached", {
        ctorName,
        hasUserTargetProp: lookAt ? "userTarget" in lookAt : false,
        hasRevertHook: typeof lookAt?.revertFirstPersonBoneQuat === "function",
        hasDebugLogFlag: typeof lookAt?.debugLogHeadRotation === "boolean",
      });

      if (typeof lookAt?.autoUpdate === "boolean") {
        lookAt.autoUpdate = true;
      }
    }

    // log all info about vrm, including blend shapes and expressions
    console.log(vrm);

    VRMUtils.rotateVRM0(vrm);
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);

    // Set default idle animation
    await this._setIdleAnimation(
      "/assets/vrm/animation/bvh/neutral_idle.bvh",
      true,
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
  public async loadVRMAAnimation(
    vrmAnimation: VRMAnimation,
    loop: boolean = false,
    options?: {
      /**
       * When true, treat this VRMA as a long-lived "state" motion baseline.
       * One-shots will return to this pose instead of BVH idle.
       */
      isState?: boolean;
      /** Crossfade seconds (state swap only). */
      fadeSeconds?: number;
    },
  ): Promise<void> {
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
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;

    const fadeSeconds = options?.fadeSeconds ?? 0.2;

    if (options?.isState) {
      // State motion: replace the baseline (idle) action with this VRMA.
      // Keep it looping so it remains a stable baseline.
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;

      const prevIdle = this._idleAction;
      this._idleAction = action;
      this._idleUrl = null;

      // Smoothly transition from current action into this new baseline.
      this._crossfadeToAction(fromAction, action, fadeSeconds);

      // If we had an old baseline that isn't the active-from action, stop it.
      if (prevIdle && prevIdle !== fromAction && prevIdle !== action) {
        this._stopActionWithFade(prevIdle, fadeSeconds);
      }
      return;
    }

    // Quirk / one-shot VRMA.
    this._currentVRMAAction = action;

    // If we're coming from a motion (not idle), make idle non-contributing immediately.
    if (fromAction !== this._idleAction) {
      this._duckIdle();
    }

    // Smoothly transition from baseline/previous motion into VRMA.
    this._crossfadeToAction(fromAction, action, 0.2);

    // Return to baseline when the one-shot VRMA finishes.
    if (!loop) {
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
    loop: boolean = false,
    options?: {
      /**
       * When true, treat this BVH as a long-lived "state" motion by replacing
       * the idle BVH baseline instead of playing as a foreground action.
       */
      isState?: boolean;
      /** Crossfade seconds (state swap only). */
      fadeSeconds?: number;
    },
  ): Promise<THREE.AnimationAction | null> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    // State motion: replace idle baseline (what one-shots return to).
    if (options?.isState) {
      // Important: switching state should preempt any currently playing quirk.
      // Otherwise we blend the new baseline underneath while the old quirk keeps
      // running until it naturally finishes.
      this.beginStateTransition(options.fadeSeconds ?? 0.12);
      await this._setIdleAnimation(url, loop, options.fadeSeconds ?? 0.2);
      return this._idleAction ?? null;
    }

    const resolvedUrl = this._resolvePublicPathOrUrl(url);

    const clip = await loadBVHAnimationFile(resolvedUrl, vrm);
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
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
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
    loop: boolean = false,
  ): Promise<THREE.AnimationAction | null> {
    const bvhPath = getBVHPathForEmotion(emotion);
    if (!bvhPath) {
      console.warn(`No BVH animation found for emotion: ${emotion}`);
      return null;
    }

    // return this.loadBVHAnimation(bvhPath, loop);

    return this.loadBVHAnimation(bvhPath, loop);
  }

  /**
   * Sets facial expression from screenplay.expression.
   * Body motion selection is handled by higher-level runtime (not here).
   */
  public async speak(buffer: ArrayBuffer | null, screenplay: Screenplay) {
    const emotionPreset = this._resolveEmotionPreset(screenplay.expression);

    // Apply mood (layered in ExpressionController).
    // We intentionally do not auto-reset to neutral here; the caller/runtime decides.
    if (this.prevPlayedEmotion !== emotionPreset) {
      this.emoteController?.setMood({
        waves: [{ expressionName: emotionPreset }],
      });
      this.prevPlayedEmotion = emotionPreset;
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
   */

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

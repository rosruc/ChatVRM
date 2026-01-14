import * as THREE from "three";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "../../lib/VRMAnimation/VRMAnimation";
import { loadBVHAnimation as loadBVHAnimationFile } from "../../lib/VRMAnimation/loadBVHAnimation";
import { getBVHPathForEmotion } from "../../lib/VRMAnimation/utils/bvhUtils";
import { buildUrl } from "@/utils/buildUrl";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "../lipSync/lipSync";
import { EmoteController } from "../emoteController/emoteController";
import { Screenplay } from "../messages/messages";
import { AnimationQueue, QueuedAnimation } from "./animationQueue";
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
  private _animationQueue?: AnimationQueue;
  private _currentVRMAAction?: THREE.AnimationAction;

  private prevPlayedEmotion: string | null = null;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
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
    
    // Initialize animation queue for sequential playback
    this._animationQueue = new AnimationQueue(this.mixer, vrm);
    
    // Set default idle animation
    await this._animationQueue.setIdleAnimation(
      "/assets/vrm/animation/bvh/neutral_idle.bvh",
      true
    );
  }

  public unLoadVrm() {
    if (this.vrm) {
      // Stop any playing VRMA animation
      if (this._currentVRMAAction) {
        this._currentVRMAAction.stop();
        this._currentVRMAAction = undefined;
      }
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
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

    // Stop previous VRMA animation if playing
    if (this._currentVRMAAction) {
      this._currentVRMAAction.stop();
      this._currentVRMAAction = undefined;
    }

    const clip = vrmAnimation.createAnimationClip(vrm);
    const action = mixer.clipAction(clip);
    this._currentVRMAAction = action;
    action.play();
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

    const action = mixer.clipAction(clip);
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
    }
    action.play();

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
    // Play body animation if motion is specified, otherwise use expression-based animation
    if (screenplay.motion) {
      // Set expression when animation starts
      this.emoteController?.playEmotion(screenplay.expression);
      this.prevPlayedEmotion = screenplay.expression;

      await this.playAnimation(screenplay.motion, {
        loop: false,
        fadeIn: 0.3,
        fadeOut: 0.3,
        onStart: () => {
          // Ensure expression is set when animation starts
          this.emoteController?.playEmotion(screenplay.expression);
          this.prevPlayedEmotion = screenplay.expression;
        },
        onComplete: () => {
          // Return to neutral expression after animation completes
          this.emoteController?.playEmotion("neutral");
          this.prevPlayedEmotion = "neutral";
        },
      });
    } else if (screenplay.expression !== "neutral") {
      // Set expression when animation starts
      this.emoteController?.playEmotion(screenplay.expression);
      this.prevPlayedEmotion = screenplay.expression;

      // Fallback: play emotion-based animation for non-neutral expressions
      await this.playAnimation(screenplay.expression, {
        loop: false,
        fadeIn: 0.3,
        fadeOut: 0.3,
        onStart: () => {
          // Ensure expression is set when animation starts
          this.emoteController?.playEmotion(screenplay.expression);
          this.prevPlayedEmotion = screenplay.expression;
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
   * Uses AnimationQueue for smooth transitions and sequential playback
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
    if (!this._animationQueue) {
      console.warn("Animation queue not initialized");
      return;
    }

    const animationPath = getAnimationPath(emotionOrAction);
    if (!animationPath) {
      console.warn(`No animation found for: ${emotionOrAction}`);
      return;
    }

    // Create a Promise that resolves when animation completes
    const animationQueue = this._animationQueue; // Store reference for closure
    return new Promise((resolve) => {
      if (!animationQueue) {
        resolve();
        return;
      }

      const animation: QueuedAnimation = {
        id: `${emotionOrAction}-${Date.now()}`,
        url: animationPath,
        loop: options.loop ?? false,
        fadeInDuration: options.fadeIn ?? 0.3,
        fadeOutDuration: options.fadeOut ?? 0.3,
        priority: options.priority ?? 0,
        onStart: options.onStart,
        onComplete: () => {
          // Call user-provided callback
          options.onComplete?.();
          // Resolve the promise
          resolve();
        },
        onInterrupt: () => {
          // Still resolve if interrupted
          resolve();
        },
      };

      animationQueue.enqueue(animation);
    });
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
    // Animation queue handles mixer update internally
    this._animationQueue?.update(delta);
    this.vrm?.update(delta);
  }
}

import { VRMHumanoid, VRMLookAt, VRMLookAtApplier } from "@pixiv/three-vrm";
import * as THREE from "three";

/** サッケードが発生するまでの最小間隔 */
const SACCADE_MIN_INTERVAL = 0.5;

/**
 * サッケードが発生する確率
 */
const SACCADE_PROC = 0.05;

/** サッケードの範囲半径。lookAtに渡される値で、実際の眼球の移動半径ではないので、若干大きめに。 in degrees */
const SACCADE_RADIUS = 5.0;

const _v3A = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _eulerA = new THREE.Euler();

/**
 * `VRMLookAt` に以下の機能を追加する:
 *
 * - `userTarget` がアサインされている場合、ユーザ方向にスムージングしながら向く
 * - 目だけでなく、頭の回転でも向く
 * - 眼球のサッケード運動を追加する
 */
export class VRMLookAtSmoother extends VRMLookAt {
  /** スムージング用の係数 */
  public smoothFactor = 4.0;

  /** Head rotation scale applied to damped yaw/pitch (1.0 = as-is). */
  public headRotationScale = 2;

  /** Slerp factor for applying head rotation (0..1). */
  public headRotationSlerp = 0.2;

  /** Optional neck assist (0 = disabled). */
  public neckRotationScale = 1;

  /** Slerp factor for applying neck rotation (0..1). */
  public neckRotationSlerp = 0.2;

  /** Clamp head rotation (in degrees) to avoid extreme twists. */
  public maxHeadRotationDeg = 50.0;

  /** Clamp neck rotation (in degrees) to keep it natural-ish. */
  public maxNeckRotationDeg = 40.0;

  /**
   * Debug mode: apply a deliberately dramatic *additive* head/neck rotation.
   * This is meant to be visually obvious even if the avatar has strong animations.
   */
  public debugDramaticHeadRotation = false;

  /** Extra multiplier used only when debugDramaticHeadRotation is enabled. */
  public debugHeadMultiplier = 6.0;

  /** Extra multiplier used only when debugDramaticHeadRotation is enabled. */
  public debugNeckMultiplier = 4.0;

  /** Wider clamp used only when debugDramaticHeadRotation is enabled. */
  public debugMaxHeadRotationDeg = 85.0;

  /** Wider clamp used only when debugDramaticHeadRotation is enabled. */
  public debugMaxNeckRotationDeg = 45.0;

  /** Log head/neck rotation changes (throttled) for debugging. */
  public debugLogHeadRotation = false;

  /** Minimum time between debug logs (ms). */
  public debugLogIntervalMs = 1000;

  private _lastDebugLogMs = 0;
  private _lastUpdateTickLogMs = 0;

  /** ユーザ向きに向く限界の角度 in degree */
  public userLimitAngle = 90.0;

  /** ユーザへの向き。もともと存在する `target` はアニメーションに使う */
  public userTarget: THREE.Object3D | null = null;

  /** `false` にするとサッケードを無効にできます */
  public enableSaccade: boolean;

  /** サッケードの移動方向を格納しておく */
  private _saccadeYaw = 0.0;

  /** サッケードの移動方向を格納しておく */
  private _saccadePitch = 0.0;

  /** このタイマーが SACCADE_MIN_INTERVAL を超えたら SACCADE_PROC の確率でサッケードを発生させる */
  private _saccadeTimer = 0.0;

  /** スムージングするyaw */
  private _yawDamped = 0.0;

  /** スムージングするpitch */
  private _pitchDamped = 0.0;

  /** render中だけ回すため、一時的にしまっておく回転 */
  private _tempHeadQuat = new THREE.Quaternion();
  private _tempNeckQuat = new THREE.Quaternion();
  private _hasTempHeadQuat = false;
  private _hasTempNeckQuat = false;

  public constructor(humanoid: VRMHumanoid, applier: VRMLookAtApplier) {
    super(humanoid, applier);

    this.enableSaccade = true;
  }

  public update(delta: number): void {
    // Very lightweight heartbeat for debugging wiring issues.
    // If this never prints, VRM.update() isn't calling into this instance.
    if (
      this.debugDramaticHeadRotation &&
      process.env.NODE_ENV !== "production"
    ) {
      const now = performance.now();
      if (
        this._lastUpdateTickLogMs === 0 ||
        now - this._lastUpdateTickLogMs >= 2000
      ) {
        this._lastUpdateTickLogMs = now;
        // eslint-disable-next-line no-console
        console.log("VRMLookAtSmoother(update tick)", {
          autoUpdate: this.autoUpdate,
          hasTarget: !!this.target,
          hasUserTarget: !!this.userTarget,
          needsUpdate: (this as any)._needsUpdate,
        });
      }
    }

    // If a user-driven look target is present, we generally expect the lookAt to run.
    // Some UI paths temporarily disable autoUpdate (manual yaw/pitch). That can make
    // eyes still appear to move (via _needsUpdate) while skipping our head/neck path.
    // For dramatic debug, force-enable autoUpdate so logs + head rotation can be seen.
    if (this.userTarget && !this.autoUpdate && this.debugDramaticHeadRotation) {
      this.autoUpdate = true;
    }

    // NOTE:
    // This project uses `userTarget` (viewer/camera gaze) in addition to the standard
    // `target` (animation gaze). We should update lookAt as long as either exists.
    if ((this.target || this.userTarget) && this.autoUpdate) {
      // アニメーションの視線 (optional)
      let yawAnimation = 0.0;
      let pitchAnimation = 0.0;

      if (this.target) {
        // `_yaw` と `_pitch` のアップデート
        this.lookAt(this.target.getWorldPosition(_v3A));
        yawAnimation = this._yaw;
        pitchAnimation = this._pitch;
      }

      // このフレームで最終的に使うことになるyaw / pitch
      let yawFrame = yawAnimation;
      let pitchFrame = pitchAnimation;

      // ユーザ向き
      if (this.userTarget) {
        // `_yaw` と `_pitch` のアップデート
        this.lookAt(this.userTarget.getWorldPosition(_v3A));

        // 角度の制限。 `userLimitAngle` を超えていた場合はアニメーションで指定された方向を向く
        if (
          this.userLimitAngle < Math.abs(this._yaw) ||
          this.userLimitAngle < Math.abs(this._pitch)
        ) {
          this._yaw = yawAnimation;
          this._pitch = pitchAnimation;
        }

        // yawDamped / pitchDampedをスムージングする
        const k = 1.0 - Math.exp(-this.smoothFactor * delta);
        this._yawDamped += (this._yaw - this._yawDamped) * k;
        this._pitchDamped += (this._pitch - this._pitchDamped) * k;

        // アニメーションとブレンディングする
        // アニメーションが横とかを向いている場合はそっちを尊重する
        const userRatio =
          1.0 -
          THREE.MathUtils.smoothstep(
            Math.sqrt(
              yawAnimation * yawAnimation + pitchAnimation * pitchAnimation,
            ),
            30.0,
            90.0,
          );

        // yawFrame / pitchFrame に結果を代入
        yawFrame = THREE.MathUtils.lerp(
          yawAnimation,
          0.6 * this._yawDamped,
          userRatio,
        );
        pitchFrame = THREE.MathUtils.lerp(
          pitchAnimation,
          0.6 * this._pitchDamped,
          userRatio,
        );

        // Head/neck rotation (for debug: make it *very* obvious)
        const debug = this.debugDramaticHeadRotation;

        const headScale =
          this.headRotationScale * (debug ? this.debugHeadMultiplier : 1.0);
        const maxHead = debug
          ? this.debugMaxHeadRotationDeg
          : this.maxHeadRotationDeg;

        const headPitch = THREE.MathUtils.clamp(
          -this._pitchDamped * headScale,
          -maxHead,
          maxHead,
        );
        const headYaw = THREE.MathUtils.clamp(
          this._yawDamped * headScale,
          -maxHead,
          maxHead,
        );

        const head = this.humanoid.getRawBoneNode("head")!;
        const neck = this.humanoid.getRawBoneNode("neck");

        const shouldLog =
          this.debugLogHeadRotation &&
          (this._lastDebugLogMs === 0 ||
            performance.now() - this._lastDebugLogMs >=
              Math.max(0, this.debugLogIntervalMs));

        const headBefore = shouldLog ? head.quaternion.clone() : null;
        const neckBefore = shouldLog && neck ? neck.quaternion.clone() : null;

        this._tempHeadQuat.copy(head.quaternion);
        this._hasTempHeadQuat = true;

        _eulerA.set(
          headPitch * THREE.MathUtils.DEG2RAD,
          headYaw * THREE.MathUtils.DEG2RAD,
          0.0,
          VRMLookAt.EULER_ORDER,
        );
        _quatA.setFromEuler(_eulerA);

        // Additive on top of the current pose, but damped via slerp.
        // (Keeps it natural and avoids the overly-obvious debug effect.)
        const headSlerp = debug
          ? 1.0
          : THREE.MathUtils.clamp(this.headRotationSlerp, 0, 1);
        _quatB.copy(this._tempHeadQuat).multiply(_quatA);
        head.quaternion.copy(this._tempHeadQuat).slerp(_quatB, headSlerp);
        head.updateMatrixWorld();

        // Neck assist (optional)
        if (neck && this.neckRotationScale > 0) {
          const neckScale =
            this.neckRotationScale * (debug ? this.debugNeckMultiplier : 1.0);
          const maxNeck = debug
            ? this.debugMaxNeckRotationDeg
            : this.maxNeckRotationDeg;

          const neckPitch = THREE.MathUtils.clamp(
            -this._pitchDamped * neckScale,
            -maxNeck,
            maxNeck,
          );
          const neckYaw = THREE.MathUtils.clamp(
            this._yawDamped * neckScale,
            -maxNeck,
            maxNeck,
          );

          this._tempNeckQuat.copy(neck.quaternion);
          this._hasTempNeckQuat = true;

          _eulerA.set(
            neckPitch * THREE.MathUtils.DEG2RAD,
            neckYaw * THREE.MathUtils.DEG2RAD,
            0.0,
            VRMLookAt.EULER_ORDER,
          );
          _quatA.setFromEuler(_eulerA);

          const neckSlerp = debug
            ? 1.0
            : THREE.MathUtils.clamp(this.neckRotationSlerp, 0, 1);
          _quatB.copy(this._tempNeckQuat).multiply(_quatA);
          neck.quaternion.copy(this._tempNeckQuat).slerp(_quatB, neckSlerp);
          neck.updateMatrixWorld();
        }

        if (shouldLog) {
          this._lastDebugLogMs = performance.now();
          const headAfter = head.quaternion.clone();
          const neckAfter = neck ? neck.quaternion.clone() : null;
          console.log("VRMLookAtSmoother(head/neck debug)", {
            delta,
            hasUserTarget: true,
            autoUpdate: this.autoUpdate,
            yawDamped: this._yawDamped,
            pitchDamped: this._pitchDamped,
            headPitchDeg: headPitch,
            headYawDeg: headYaw,
            head: {
              name: head.name,
              before: headBefore,
              after: headAfter,
            },
            neck: neck
              ? {
                  name: neck.name,
                  before: neckBefore,
                  after: neckAfter,
                }
              : null,
          });
        }
      }

      if (this.enableSaccade) {
        // サッケードの移動方向を計算
        if (
          SACCADE_MIN_INTERVAL < this._saccadeTimer &&
          Math.random() < SACCADE_PROC
        ) {
          this._saccadeYaw = (2.0 * Math.random() - 1.0) * SACCADE_RADIUS;
          this._saccadePitch = (2.0 * Math.random() - 1.0) * SACCADE_RADIUS;
          this._saccadeTimer = 0.0;
        }

        this._saccadeTimer += delta;

        // サッケードの移動分を加算
        yawFrame += this._saccadeYaw;
        pitchFrame += this._saccadePitch;

        // applierにわたす
        this.applier.applyYawPitch(yawFrame, pitchFrame);
      }

      // applyはもうしたので、このフレーム内でアップデートする必要はない
      this._needsUpdate = false;
    }

    // targetでlookAtを制御しない場合
    if (this._needsUpdate) {
      this._needsUpdate = false;
      this.applier.applyYawPitch(this._yaw, this._pitch);
    }
  }

  /** renderしたあとに叩いて頭の回転をもとに戻す */
  public revertFirstPersonBoneQuat(): void {
    if (this.userTarget) {
      if (this._hasTempHeadQuat) {
        const head = this.humanoid.getRawBoneNode("head");
        head?.quaternion.copy(this._tempHeadQuat);
      }

      if (this._hasTempNeckQuat) {
        const neck = this.humanoid.getRawBoneNode("neck");
        neck?.quaternion.copy(this._tempNeckQuat);
      }

      this._hasTempHeadQuat = false;
      this._hasTempNeckQuat = false;
    }
  }
}

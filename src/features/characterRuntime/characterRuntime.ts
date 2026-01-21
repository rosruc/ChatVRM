import type { Screenplay } from "@/features/messages/messages";
import type { Viewer } from "@/features/vrmViewer/viewer";
import { resolveMotionTag } from "./motionCatalog";
import type { VRMExpressionPresetName } from "@pixiv/three-vrm";

export type RuntimeState = "idle" | "waiting" | "speaking";

export type PreparedScreenplay = {
  screenplay: Screenplay;
  onStart?: () => void;
  onEnd?: () => void;
};

function resolveEmotionPreset(
  emotion: Screenplay["expression"],
): VRMExpressionPresetName {
  if (emotion === "rapture") return "surprised";
  return (emotion as any) ?? "neutral";
}

/**
 * CharacterRuntime is a thin orchestration layer:
 * - Handles waiting/no-response behavior
 * - Converts parsed tags into state motions vs quirk motions
 * - Applies expression layers (mood + emote) without letting actions overwrite speech mood
 */
export class CharacterRuntime {
  private _viewer: Viewer | null = null;
  private _state: RuntimeState = "idle";

  private _llmTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public setViewer(viewer: Viewer | null | undefined) {
    this._viewer = viewer ?? null;
  }

  public getState(): RuntimeState {
    return this._state;
  }

  public enterWaiting(options: { timeoutMs?: number } = {}) {
    this._state = "waiting";

    // Default: a seated idle while waiting.
    // This is a STATE motion implemented by swapping the Model idle BVH.
    this._setStateIdleBvh("/assets/vrm/animation/bvh/sit_idle.bvh");

    // Mild neutral face while waiting.
    this._viewer?.model?.emoteController?.setMood({
      waves: [{ expressionName: "neutral" }],
    });

    if (this._llmTimeoutId) {
      clearTimeout(this._llmTimeoutId);
      this._llmTimeoutId = null;
    }

    const timeoutMs = Math.max(0, options.timeoutMs ?? 15000);
    if (timeoutMs > 0) {
      this._llmTimeoutId = setTimeout(() => {
        this._llmTimeoutId = null;
        this.onNoResponse();
      }, timeoutMs);
    }
  }

  public exitWaiting() {
    if (this._llmTimeoutId) {
      clearTimeout(this._llmTimeoutId);
      this._llmTimeoutId = null;
    }

    // Return to the default idle state motion.
    this._setStateIdleBvh("/assets/vrm/animation/bvh/neutral_idle.bvh");

    if (this._state === "waiting") {
      this._state = "idle";
    }
  }

  /**
   * When LLM is slow / no response: do a small quirk to show liveness.
   */
  public onNoResponse() {
    // Keep waiting state motion, but do a tiny "look around" quirk.
    this._viewer?.model?.emoteController?.playPresetQuirk("surprised", {
      weight: 0.2,
      durationSec: 1.2,
    });
    void this._viewer?.loadVRMA("/assets/vrm/animation/vrma/LookAround.vrma");
  }

  /**
   * Convert a Screenplay (from textToScreenplay) into:
   * - a speech-only screenplay (motion removed)
   * - optional start hooks for quirk motions
   * - state-motion changes applied immediately
   */
  public prepareForSpeech(screenplay: Screenplay): PreparedScreenplay {
    const viewer = this._viewer;

    // Apply speech mood immediately (so avatar reacts during TTS latency).
    const emotionPreset = resolveEmotionPreset(screenplay.expression);
    viewer?.model?.emoteController?.setMood({
      waves: [{ expressionName: emotionPreset }],
    });

    const motionDef = resolveMotionTag(screenplay.motion);

    // Never let Model.speak decide body motions; we strip motion for speech.
    const speechOnly: Screenplay = { ...screenplay, motion: undefined };

    if (!motionDef) {
      return { screenplay: speechOnly };
    }

    if (motionDef.kind === "state") {
      // State motion replaces idle and loops.
      if (motionDef.format === "bvh") {
        this._setStateIdleBvh(motionDef.url);
      } else {
        void viewer?.setStateVRMA(motionDef.url, true);
      }

      if (motionDef.expression?.mood) {
        viewer?.model?.emoteController?.setMood({
          waves: [{ expressionName: motionDef.expression.mood }],
        });
      }

      return { screenplay: speechOnly };
    }

    // Quirk motion: play exactly once *when speech starts*.
    const onStart = () => {
      if (!this._viewer) return;

      const profile = motionDef.expression;
      if (profile?.emote) {
        this._viewer.model?.emoteController?.playPresetQuirk(profile.emote, {
          weight: profile.emoteWeight,
          durationSec: profile.emoteDurationSec,
        });
      }

      if (motionDef.format === "vrma") {
        void this._viewer.loadVRMA(motionDef.url, false);
      } else {
        void this._viewer.loadBVH(motionDef.url, false);
      }
    };

    return { screenplay: speechOnly, onStart };
  }

  private _setStateIdleBvh(url: string) {
    void this._viewer?.setStateBVH(url, true);
  }
}

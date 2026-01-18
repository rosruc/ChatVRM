import { VRMExpressionPresetName } from "@pixiv/three-vrm";

export type MotionKind = "state" | "quirk";
export type MotionFormat = "bvh" | "vrma";

export type MotionExpressionProfile = {
  // Mood is a longer-lived base (maps to ExpressionController.playEmotion).
  mood?: VRMExpressionPresetName;
  // Emote is a temporary overlay (maps to ExpressionController.playEmote).
  emote?: VRMExpressionPresetName;
  emoteWeight?: number; // 0..1
  emoteDurationSec?: number;
};

export type MotionDef = {
  id: string;
  kind: MotionKind;
  format: MotionFormat;
  // Workspace-relative public asset URL (e.g. "/assets/vrm/animation/bvh/neutral_idle.bvh")
  url: string;
  // For state motions, loop should generally be true.
  loop?: boolean;
  // Optional facial intent attached to the motion.
  expression?: MotionExpressionProfile;
};

// Canonical IDs that LLM tags can map to.
export const MOTIONS = {
  idle: {
    id: "idle",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/neutral_idle.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  sit: {
    id: "sit",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/sit_idle.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  kneel: {
    id: "kneel",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/kneel_idle.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  lay: {
    id: "lay",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/laying_idle.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  sad: {
    id: "sad",
    kind: "state",
    format: "vrma",
    url: "/assets/vrm/animation/vrma/Sad.vrma",
    loop: true,
    expression: { mood: "sad" },
  },

  // --- quirks (one-shot)
  wave: {
    id: "wave",
    kind: "quirk",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/action_greeting.bvh",
    loop: false,
    expression: { emote: "happy", emoteWeight: 0.35, emoteDurationSec: 1.0 },
  },
  nod: {
    id: "nod",
    kind: "quirk",
    format: "vrma",
    url: "/assets/vrm/animation/vrma/004_hello_1.vrma",
    loop: false,
    expression: { emote: "neutral", emoteWeight: 0.25, emoteDurationSec: 0.8 },
  },
  jump: {
    id: "jump",
    kind: "quirk",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/action_jump.bvh",
    loop: false,
    expression: {
      emote: "surprised",
      emoteWeight: 0.35,
      emoteDurationSec: 1.0,
    },
  },
  lookAround: {
    id: "lookAround",
    kind: "quirk",
    format: "vrma",
    url: "/assets/vrm/animation/vrma/LookAround.vrma",
    loop: false,
    expression: { emote: "surprised", emoteWeight: 0.2, emoteDurationSec: 1.2 },
  },
  thinking: {
    id: "thinking",
    kind: "quirk",
    format: "vrma",
    url: "/assets/vrm/animation/vrma/Thinking.vrma",
    loop: false,
    expression: { emote: "neutral", emoteWeight: 0.15, emoteDurationSec: 1.4 },
  },

  // locomotion-ish actions (treat as state loops if you want persistent walking)
  walk: {
    id: "walk",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/action_walk.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  run: {
    id: "run",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/action_run.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  jog: {
    id: "jog",
    kind: "state",
    format: "bvh",
    url: "/assets/vrm/animation/bvh/action_jog.bvh",
    loop: true,
    expression: { mood: "neutral" },
  },
  greeting: {
    id: "greeting",
    kind: "quirk",
    format: "vrma",
    url: "/assets/vrm/animation/vrma/VRMA_03.vrma",
    loop: false,
    expression: { emote: "happy", emoteWeight: 0.3, emoteDurationSec: 1.0 },
  },
} as const satisfies Record<string, MotionDef>;

export type MotionId = keyof typeof MOTIONS;

// Map raw LLM motion tags (from [xxx]) -> MotionDef.
// Keep this conservative; unknown tags should be ignored.
export function resolveMotionTag(tag: string | undefined): MotionDef | null {
  if (!tag) return null;
  const normalized = tag.trim().toLowerCase();

  // aliases
  if (normalized === "sitting") return MOTIONS.sit;
  if (normalized === "sit") return MOTIONS.sit;
  if (normalized === "idle") return MOTIONS.idle;
  if (normalized === "kneel") return MOTIONS.kneel;
  if (normalized === "lay" || normalized === "laydown") return MOTIONS.lay;

  if (normalized in MOTIONS) {
    return (MOTIONS as any)[normalized] as MotionDef;
  }

  // Some tags in messages.ts are semantically "wave" but named "greeting".
  if (normalized === "greeting" || normalized === "greeting1")
    return MOTIONS.wave;

  return null;
}

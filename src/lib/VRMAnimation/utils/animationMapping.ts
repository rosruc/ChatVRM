/**
 * Animation mapping system for LLM-to-animation control
 * Supports animation groups for variety (e.g., joy1.bvh, joy2.bvh, joy3.bvh)
 *
 * Based on SillyTavern Extension-VRM animation mapping approach
 */

export interface AnimationMapping {
  [key: string]: string | string[]; // Single path or array for groups
}

/**
 * Default animation mapping from emotions/actions to BVH files
 * Supports animation groups - if array is provided, random selection is used
 */
export const DEFAULT_ANIMATION_MAPPING: AnimationMapping = {
  // Emotions - with animation groups for variety
  joy: [
    "/assets/vrm/animation/joy.bvh",
    "/assets/vrm/animation/joy2.bvh",
    "/assets/vrm/animation/joy3.bvh",
  ],
  happy: ["/assets/vrm/animation/joy.bvh", "/assets/vrm/animation/joy2.bvh"],
  anger: [
    "/assets/vrm/animation/anger.bvh",
    "/assets/vrm/animation/anger2.bvh",
    "/assets/vrm/animation/anger3.bvh",
  ],
  angry: [
    "/assets/vrm/animation/anger.bvh",
    "/assets/vrm/animation/anger2.bvh",
  ],
  sadness: [
    "/assets/vrm/animation/sadness.bvh",
    "/assets/vrm/animation/sadness2.bvh",
  ],
  sad: "/assets/vrm/animation/sadness.bvh",
  excitement: [
    "/assets/vrm/animation/excitement.bvh",
    "/assets/vrm/animation/excitement2.bvh",
    "/assets/vrm/animation/excitement3.bvh",
  ],
  surprise: [
    "/assets/vrm/animation/surprise.bvh",
    "/assets/vrm/animation/surprise2.bvh",
  ],
  fear: [
    "/assets/vrm/animation/fear.bvh",
    "/assets/vrm/animation/fear2.bvh",
    "/assets/vrm/animation/fear3.bvh",
  ],
  disgust: [
    "/assets/vrm/animation/disgust.bvh",
    "/assets/vrm/animation/disgust1.bvh",
    "/assets/vrm/animation/disgust2.bvh",
  ],
  confusion: [
    "/assets/vrm/animation/confusion.bvh",
    "/assets/vrm/animation/confusion2.bvh",
    "/assets/vrm/animation/confusion3.bvh",
  ],
  amusement: [
    "/assets/vrm/animation/amusement.bvh",
    "/assets/vrm/animation/amusement2.bvh",
    "/assets/vrm/animation/amusement3.bvh",
  ],
  love: [
    "/assets/vrm/animation/love.bvh",
    "/assets/vrm/animation/love2.bvh",
    "/assets/vrm/animation/love3.bvh",
  ],
  neutral: "/assets/vrm/animation/neutral_idle.bvh",
  relaxed: "/assets/vrm/animation/neutral_idle.bvh",

  // Actions
  wave: "/assets/vrm/animation/action_greeting.bvh",
  greeting: [
    "/assets/vrm/animation/action_greeting.bvh",
    "/assets/vrm/animation/action_greeting1.bvh",
  ],
  nod: "/assets/vrm/animation/action_attention_seeking.bvh",
  jump: "/assets/vrm/animation/action_jump.bvh",
  walk: "/assets/vrm/animation/action_walk.bvh",
  run: "/assets/vrm/animation/action_run.bvh",
  jog: "/assets/vrm/animation/action_jog.bvh",
  crouch: "/assets/vrm/animation/action_crouch.bvh",
  laydown: "/assets/vrm/animation/action_laydown.bvh",
  standup: "/assets/vrm/animation/action_standup.bvh",
  pat: "/assets/vrm/animation/action_pat.bvh",
  pickingup: "/assets/vrm/animation/action_pickingup.bvh",
  crawling: "/assets/vrm/animation/action_crawling.bvh",
  gaming: "/assets/vrm/animation/action_gaming.bvh",
  attention_seeking: "/assets/vrm/animation/action_attention_seeking.bvh",
};

/**
 * Get animation path(s) for a given emotion/action
 * Returns random selection if multiple options available (animation groups)
 *
 * @param key - Emotion or action name (case-insensitive)
 * @returns Animation file path or null if not found
 */
export function getAnimationPath(key: string): string | null {
  if (!key) return null;

  const normalizedKey = key.toLowerCase().trim();
  const mapping = DEFAULT_ANIMATION_MAPPING[normalizedKey];

  if (!mapping) {
    // Try partial match for common variations
    const partialMatch = Object.keys(DEFAULT_ANIMATION_MAPPING).find(
      (k) => normalizedKey.includes(k) || k.includes(normalizedKey)
    );
    if (partialMatch) {
      const matchedMapping = DEFAULT_ANIMATION_MAPPING[partialMatch];
      if (Array.isArray(matchedMapping)) {
        return matchedMapping[
          Math.floor(Math.random() * matchedMapping.length)
        ];
      }
      return matchedMapping;
    }
    return null;
  }

  if (Array.isArray(mapping)) {
    // Random selection from animation group
    return mapping[Math.floor(Math.random() * mapping.length)];
  }

  return mapping;
}

/**
 * Check if an animation exists for the given key
 */
export function hasAnimation(key: string): boolean {
  return getAnimationPath(key) !== null;
}

/**
 * Get all available animation keys
 */
export function getAvailableAnimations(): string[] {
  return Object.keys(DEFAULT_ANIMATION_MAPPING);
}

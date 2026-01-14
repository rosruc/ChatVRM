# Animation Control Implementation Guide
## How LLM Results and Audio Control VRM Animations

This document provides a comprehensive implementation guide for controlling VRM animations (motions and expressions) based on LLM results and audio, inspired by the [SillyTavern Extension-VRM](https://github.com/SillyTavern/Extension-VRM) approach.

---

## Table of Contents

1. [Overview](#overview)
2. [Animation Sequencing](#animation-sequencing)
3. [Animation Blending](#animation-blending)
4. [LLM-to-Animation Mapping](#llm-to-animation-mapping)
5. [Audio-Driven Animation Triggers](#audio-driven-animation-triggers)
6. [Implementation Architecture](#implementation-architecture)
7. [Code Examples](#code-examples)

---

## Overview

### Current State
- ✅ **Expressions**: Facial expressions are controlled via emotion tags `[happy]`, `[sad]`, etc.
- ✅ **Lip Sync**: Audio volume drives jaw/mouth blend shapes
- ✅ **BVH Animations**: 116+ BVH animation files available
- ❌ **Animation Sequencing**: No queue system for playing animations in sequence
- ❌ **Animation Blending**: No crossfading between animations
- ❌ **Dynamic Animation Selection**: Only neutral idle animation plays continuously

### Target State
- ✅ **Sequential Playback**: Animations play one after another with smooth transitions
- ✅ **Crossfade Blending**: Smooth transitions between different animations
- ✅ **LLM-Driven Selection**: LLM emotion tags trigger corresponding body animations
- ✅ **Audio Synchronization**: Animations sync with speech timing
- ✅ **Animation Groups**: Support for random selection from animation groups (e.g., `joy1.bvh`, `joy2.bvh`, `joy3.bvh`)

---

## Animation Sequencing

### Concept
Animations should play in sequence when multiple emotions/actions are detected in LLM responses. For example:
```
[happy] Hello! [wave] Nice to meet you! [nod] I understand.
```
Should trigger: `happy` expression → `wave` animation → `nod` animation, all in sequence.

### Implementation Strategy

#### 1. Animation Queue System
Create an `AnimationQueue` class that manages sequential playback:

```typescript
// src/features/vrmViewer/animationQueue.ts

import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";

export interface QueuedAnimation {
  id: string;
  url: string;
  loop: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  priority: number; // Higher priority interrupts lower priority
  onStart?: () => void;
  onComplete?: () => void;
  onInterrupt?: () => void;
}

export class AnimationQueue {
  private mixer: THREE.AnimationMixer;
  private vrm: VRM;
  private queue: QueuedAnimation[] = [];
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimation: QueuedAnimation | null = null;
  private isPlaying: boolean = false;
  private idleAction: THREE.AnimationAction | null = null;

  constructor(mixer: THREE.AnimationMixer, vrm: VRM) {
    this.mixer = mixer;
    this.vrm = vrm;
  }

  /**
   * Set the idle animation that plays when queue is empty
   */
  public setIdleAnimation(url: string, loop: boolean = true): Promise<void> {
    return this.loadAnimation(url, loop).then((action) => {
      this.idleAction = action;
      if (this.queue.length === 0 && !this.isPlaying) {
        action?.play();
      }
    });
  }

  /**
   * Add animation to queue
   */
  public enqueue(animation: QueuedAnimation): void {
    // If higher priority, interrupt current and clear lower priority items
    if (this.currentAnimation && animation.priority > this.currentAnimation.priority) {
      this.interruptCurrent();
      this.queue = [animation]; // Clear queue, only keep new high-priority
    } else {
      this.queue.push(animation);
    }

    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  /**
   * Process animation queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      // Return to idle animation
      if (this.idleAction && !this.idleAction.isRunning()) {
        this.idleAction.reset().fadeIn(0.5).play();
      }
      return;
    }

    this.isPlaying = true;
    const animation = this.queue.shift()!;
    this.currentAnimation = animation;

    try {
      // Fade out current animation (if any)
      if (this.currentAction && this.currentAction.isRunning()) {
        this.currentAction.fadeOut(animation.fadeOutDuration);
      }

      // Load and play new animation
      const action = await this.loadAnimation(animation.url, animation.loop);
      if (!action) {
        this.processQueue(); // Skip failed animation
        return;
      }

      this.currentAction = action;
      animation.onStart?.();

      // Fade in new animation
      action.reset().fadeIn(animation.fadeInDuration).play();

      // Wait for animation to complete (if not looping)
      if (!animation.loop) {
        await this.waitForAnimationComplete(action, animation);
      } else {
        // For looping animations, play for a minimum duration
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      animation.onComplete?.();
    } catch (error) {
      console.error("Animation playback error:", error);
      animation.onInterrupt?.();
    } finally {
      this.currentAnimation = null;
      // Process next animation in queue
      this.processQueue();
    }
  }

  /**
   * Load animation from URL
   */
  private async loadAnimation(
    url: string,
    loop: boolean
  ): Promise<THREE.AnimationAction | null> {
    // Implementation depends on your animation loader (BVH, VRMA, etc.)
    // This is a placeholder - use your existing loadBVHAnimation or loadVRMAnimation
    const clip = await this.loadAnimationClip(url);
    if (!clip) return null;

    const action = this.mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    return action;
  }

  /**
   * Wait for animation to complete
   */
  private waitForAnimationComplete(
    action: THREE.AnimationAction,
    animation: QueuedAnimation
  ): Promise<void> {
    return new Promise((resolve) => {
      const onFinished = () => {
        action.removeEventListener("finished", onFinished);
        resolve();
      };
      action.addEventListener("finished", onFinished);

      // Safety timeout (10 seconds max)
      setTimeout(() => {
        action.removeEventListener("finished", onFinished);
        resolve();
      }, 10000);
    });
  }

  /**
   * Interrupt current animation
   */
  private interruptCurrent(): void {
    if (this.currentAction) {
      this.currentAction.fadeOut(0.2).stop();
    }
    if (this.currentAnimation) {
      this.currentAnimation.onInterrupt?.();
    }
    this.currentAnimation = null;
  }

  /**
   * Clear all queued animations
   */
  public clear(): void {
    this.queue = [];
    this.interruptCurrent();
  }

  /**
   * Update animation mixer (call in animation loop)
   */
  public update(delta: number): void {
    this.mixer.update(delta);
  }
}
```

#### 2. Integration with Model Class

```typescript
// src/features/vrmViewer/model.ts (additions)

import { AnimationQueue, QueuedAnimation } from "./animationQueue";

export class Model {
  // ... existing code ...
  private animationQueue?: AnimationQueue;

  public async loadVRM(url: string): Promise<void> {
    // ... existing VRM loading code ...
    
    // Initialize animation queue
    this.animationQueue = new AnimationQueue(this.mixer!, this.vrm!);
    
    // Set idle animation
    await this.animationQueue.setIdleAnimation(
      buildUrl("/assets/vrm/animation/neutral_idle.bvh"),
      true
    );
  }

  /**
   * Play animation with sequencing support
   */
  public async playAnimation(
    emotion: string,
    options: {
      loop?: boolean;
      fadeIn?: number;
      fadeOut?: number;
      priority?: number;
    } = {}
  ): Promise<void> {
    const bvhPath = getBVHPathForEmotion(emotion);
    if (!bvhPath) {
      console.warn(`No animation found for emotion: ${emotion}`);
      return;
    }

    const animation: QueuedAnimation = {
      id: `${emotion}-${Date.now()}`,
      url: buildUrl(bvhPath),
      loop: options.loop ?? false,
      fadeInDuration: options.fadeIn ?? 0.3,
      fadeOutDuration: options.fadeOut ?? 0.3,
      priority: options.priority ?? 0,
    };

    this.animationQueue?.enqueue(animation);
  }

  public update(delta: number): void {
    // ... existing update code ...
    this.animationQueue?.update(delta);
  }
}
```

---

## Animation Blending

### Concept
When transitioning between animations, use Three.js `AnimationMixer`'s built-in crossfading to create smooth blends. This prevents jarring transitions.

### Implementation Strategy

#### 1. Crossfade Between Animations

Three.js `AnimationAction` provides `crossFadeTo()` method:

```typescript
// Example: Crossfade from current to new animation
const currentAction = mixer.clipAction(currentClip);
const newAction = mixer.clipAction(newClip);

// Crossfade over 0.5 seconds
currentAction.crossFadeTo(newAction, 0.5, false);
newAction.play();
```

#### 2. Enhanced Animation Queue with Crossfade

```typescript
// Enhanced AnimationQueue with better blending

export class AnimationQueue {
  // ... existing code ...

  private async processQueue(): Promise<void> {
    // ... existing code ...

    const action = await this.loadAnimation(animation.url, animation.loop);
    if (!action) {
      this.processQueue();
      return;
    }

    // Crossfade from current to new animation
    if (this.currentAction && this.currentAction.isRunning()) {
      this.currentAction.crossFadeTo(action, animation.fadeInDuration, false);
    } else {
      action.reset().fadeIn(animation.fadeInDuration);
    }

    action.play();
    this.currentAction = action;

    // ... rest of code ...
  }
}
```

#### 3. Expression + Motion Blending

Blend facial expressions with body animations:

```typescript
// src/features/emoteController/emoteController.ts (enhanced)

export class EmoteController {
  // ... existing code ...

  /**
   * Play emotion with both expression and motion
   */
  public async playEmotionWithMotion(
    preset: VRMExpressionPresetName,
    emotion: string,
    model: Model
  ): Promise<void> {
    // Set facial expression (immediate)
    this.playEmotion(preset);

    // Play corresponding body animation (queued)
    await model.playAnimation(emotion, {
      loop: false,
      fadeIn: 0.3,
      fadeOut: 0.3,
    });
  }
}
```

---

## LLM-to-Animation Mapping

### Concept
Map LLM emotion tags and action tags to specific animations. Support animation groups for variety.

### Implementation Strategy

#### 1. Enhanced Screenplay Type

```typescript
// src/features/messages/messages.ts (additions)

export type Screenplay = {
  expression: EmotionType;
  motion?: string; // Animation name (e.g., "joy", "wave", "nod")
  talk: Talk;
};
```

#### 2. Animation Mapping System

```typescript
// src/lib/VRMAnimation/utils/animationMapping.ts

/**
 * Map emotion/action names to animation file paths
 * Supports animation groups (e.g., joy1.bvh, joy2.bvh, joy3.bvh)
 */
export interface AnimationMapping {
  [key: string]: string | string[]; // Single path or array for groups
}

export const DEFAULT_ANIMATION_MAPPING: AnimationMapping = {
  // Emotions
  "joy": ["/assets/vrm/animation/joy.bvh", "/assets/vrm/animation/joy2.bvh", "/assets/vrm/animation/joy3.bvh"],
  "happy": ["/assets/vrm/animation/joy.bvh", "/assets/vrm/animation/joy2.bvh"],
  "anger": ["/assets/vrm/animation/anger.bvh", "/assets/vrm/animation/anger2.bvh", "/assets/vrm/animation/anger3.bvh"],
  "angry": ["/assets/vrm/animation/anger.bvh"],
  "sadness": ["/assets/vrm/animation/sadness.bvh", "/assets/vrm/animation/sadness2.bvh"],
  "sad": ["/assets/vrm/animation/sadness.bvh"],
  "neutral": "/assets/vrm/animation/neutral_idle.bvh",
  
  // Actions
  "wave": "/assets/vrm/animation/action_greeting.bvh",
  "nod": "/assets/vrm/animation/action_attention_seeking.bvh",
  "jump": "/assets/vrm/animation/action_jump.bvh",
  "walk": "/assets/vrm/animation/action_walk.bvh",
  "run": "/assets/vrm/animation/action_run.bvh",
  
  // ... more mappings
};

/**
 * Get animation path(s) for a given emotion/action
 * Returns random selection if multiple options available
 */
export function getAnimationPath(key: string): string | null {
  const mapping = DEFAULT_ANIMATION_MAPPING[key.toLowerCase()];
  if (!mapping) return null;

  if (Array.isArray(mapping)) {
    // Random selection from group
    return mapping[Math.floor(Math.random() * mapping.length)];
  }

  return mapping;
}
```

#### 3. Enhanced Text Parsing

```typescript
// src/features/messages/messages.ts (enhanced)

export const textsToScreenplay = (
  texts: string[],
  koeiroParam: KoeiroParam
): Screenplay[] => {
  const screenplays: Screenplay[] = [];
  let prevExpression = "neutral";
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    // Extract emotion tag: [happy]
    const emotionMatch = text.match(/\[(happy|sad|angry|neutral|relaxed|joy|anger|sadness)\]/i);
    const emotionTag = emotionMatch ? emotionMatch[1] : prevExpression;

    // Extract action tag: [wave], [nod], etc.
    const actionMatch = text.match(/\[(wave|nod|jump|walk|run|greeting)\]/i);
    const actionTag = actionMatch ? actionMatch[1] : undefined;

    // Remove all tags from message
    const message = text.replace(/\[(.*?)\]/g, "");

    let expression = prevExpression;
    if (emotions.includes(emotionTag as any)) {
      expression = emotionTag;
      prevExpression = emotionTag;
    }

    screenplays.push({
      expression: expression as EmotionType,
      motion: actionTag, // Add motion field
      talk: {
        style: emotionToTalkStyle(expression as EmotionType),
        speakerX: koeiroParam.speakerX,
        speakerY: koeiroParam.speakerY,
        message: message,
      },
    });
  }

  return screenplays;
};
```

#### 4. Integration with Speak Flow

```typescript
// src/features/vrmViewer/model.ts (enhanced speak method)

public async speak(buffer: ArrayBuffer | null, screenplay: Screenplay) {
  // Set facial expression
  if (this.prevPlayedEmotion !== screenplay.expression) {
    this.emoteController?.playEmotion(screenplay.expression);
    this.prevPlayedEmotion = screenplay.expression;
  }

  // Play body animation if motion is specified
  if (screenplay.motion) {
    await this.playAnimation(screenplay.motion, {
      loop: false,
      fadeIn: 0.3,
      fadeOut: 0.3,
    });
  } else if (screenplay.expression !== "neutral") {
    // Fallback: play emotion-based animation
    await this.playAnimation(screenplay.expression, {
      loop: false,
      fadeIn: 0.3,
      fadeOut: 0.3,
    });
  }

  // Play audio for lip sync
  if (buffer) {
    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      });
    });
  }
}
```

---

## Audio-Driven Animation Triggers

### Concept
Use audio analysis to trigger animations based on:
- **Volume peaks**: Trigger gestures on emphasis
- **Speech patterns**: Detect pauses, questions, exclamations
- **Timing**: Sync animations with speech rhythm

### Implementation Strategy

#### 1. Audio Analysis Enhancement

```typescript
// src/features/lipSync/lipSync.ts (enhancements)

export interface AudioAnalysisResult {
  volume: number;
  peakDetected: boolean; // True when volume exceeds threshold
  speechPause: boolean; // True during silence
  emphasisLevel: number; // 0-1, based on volume change rate
}

export class LipSync {
  // ... existing code ...

  private previousVolume: number = 0;
  private volumeHistory: number[] = [];
  private readonly PEAK_THRESHOLD = 0.7;
  private readonly PAUSE_THRESHOLD = 0.1;

  public update(): AudioAnalysisResult {
    const { volume } = this.update(); // Existing update logic

    // Detect volume peaks (sudden increases)
    const volumeChange = volume - this.previousVolume;
    const peakDetected = volume > this.PEAK_THRESHOLD && volumeChange > 0.3;

    // Detect speech pauses
    const speechPause = volume < this.PAUSE_THRESHOLD;

    // Calculate emphasis level (rate of volume change)
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > 10) {
      this.volumeHistory.shift();
    }
    const emphasisLevel = Math.min(1, Math.abs(volumeChange) * 2);

    this.previousVolume = volume;

    return {
      volume,
      peakDetected,
      speechPause,
      emphasisLevel,
    };
  }
}
```

#### 2. Audio-Triggered Gestures

```typescript
// src/features/vrmViewer/model.ts (audio-driven animations)

public update(delta: number): void {
  if (this._lipSync) {
    const analysis = this._lipSync.update();

    // Apply lip sync
    this.emoteController?.lipSync("JawOpen", analysis.volume);

    // Trigger gesture on volume peak (emphasis)
    if (analysis.peakDetected && !this.isPlayingAnimation) {
      // Random gesture on emphasis
      const gestures = ["nod", "wave"];
      const randomGesture = gestures[Math.floor(Math.random() * gestures.length)];
      this.playAnimation(randomGesture, {
        loop: false,
        fadeIn: 0.2,
        fadeOut: 0.2,
        priority: 1, // Low priority, can be interrupted
      });
    }
  }

  // ... rest of update code ...
}
```

---

## Implementation Architecture

### Complete Flow Diagram

```
LLM Response
    ↓
Text Parsing (extract [emotion] and [action] tags)
    ↓
Screenplay Creation (expression + motion + talk)
    ↓
┌─────────────────┬──────────────────┐
│                 │                  │
Expression        Motion             Audio
Controller        Queue              Analysis
    ↓                 ↓                    ↓
Facial Blend      Body Animation      Lip Sync
Shapes            (Sequenced)         (Volume)
    ↓                 ↓                    ↓
    └─────────────────┴──────────────────┘
                    ↓
            VRM Model Update
                    ↓
              Render Frame
```

### Key Components

1. **AnimationQueue**: Manages sequential playback with crossfading
2. **AnimationMapping**: Maps emotions/actions to animation files
3. **Enhanced Screenplay**: Includes motion field
4. **Audio Analysis**: Detects peaks, pauses, emphasis
5. **Model Integration**: Coordinates expression, motion, and lip sync

---

## Code Examples

### Example 1: Sequential Animation Playback

```typescript
// User sends: "[happy] Hello! [wave] Nice to meet you!"

const screenplays = textsToScreenplay(["[happy] Hello! [wave] Nice to meet you!"], koeiroParam);
// Result:
// [
//   { expression: "happy", motion: undefined, talk: { message: "Hello!", ... } },
//   { expression: "happy", motion: "wave", talk: { message: "Nice to meet you!", ... } }
// ]

// Playback:
// 1. Set "happy" expression
// 2. Play "happy" body animation (from emotion)
// 3. Speak "Hello!" with lip sync
// 4. Play "wave" animation (from motion tag)
// 5. Speak "Nice to meet you!" with lip sync
```

### Example 2: Animation Blending

```typescript
// Transition from "neutral_idle" to "joy" animation

// Current: neutral_idle (looping)
// New: joy (one-shot)

// AnimationQueue automatically:
// 1. Fades out neutral_idle over 0.3s
// 2. Crossfades to joy over 0.3s
// 3. Plays joy animation
// 4. Returns to neutral_idle when queue is empty
```

### Example 3: Audio-Triggered Gesture

```typescript
// During speech, volume peak detected
// → Automatically triggers "nod" gesture
// → Gesture plays with low priority (can be interrupted)
// → Returns to current animation after gesture completes
```

---

## Next Steps

1. **Implement AnimationQueue class** (`src/features/vrmViewer/animationQueue.ts`)
2. **Create AnimationMapping system** (`src/lib/VRMAnimation/utils/animationMapping.ts`)
3. **Enhance Screenplay type** to include `motion` field
4. **Update text parsing** to extract action tags
5. **Integrate with Model.speak()** to trigger animations
6. **Add audio analysis** for gesture triggers
7. **Test with various LLM responses** to ensure smooth playback

---

## References

- [SillyTavern Extension-VRM](https://github.com/SillyTavern/Extension-VRM)
- [Three.js AnimationMixer Documentation](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- [Three.js AnimationAction Documentation](https://threejs.org/docs/#api/en/animation/AnimationAction)


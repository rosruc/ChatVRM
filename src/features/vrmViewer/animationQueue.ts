import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { loadBVHAnimation } from "@/lib/VRMAnimation/loadBVHAnimation";
import { buildUrl } from "@/utils/buildUrl";

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

/**
 * Manages sequential playback of VRM animations with crossfading support
 * Inspired by SillyTavern Extension-VRM animation system
 */
export class AnimationQueue {
  private mixer: THREE.AnimationMixer;
  private vrm: VRM;
  private queue: QueuedAnimation[] = [];
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimation: QueuedAnimation | null = null;
  private isPlaying: boolean = false;
  private idleAction: THREE.AnimationAction | null = null;
  private idleUrl: string | null = null;

  constructor(mixer: THREE.AnimationMixer, vrm: VRM) {
    this.mixer = mixer;
    this.vrm = vrm;
  }

  /**
   * Set the idle animation that plays when queue is empty
   */
  public async setIdleAnimation(url: string, loop: boolean = true): Promise<void> {
    this.idleUrl = url;
    const clip = await loadBVHAnimation(buildUrl(url), this.vrm);
    if (!clip) {
      console.warn(`Failed to load idle animation: ${url}`);
      return;
    }

    const action = this.mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    this.idleAction = action;

    // Start idle if queue is empty
    if (this.queue.length === 0 && !this.isPlaying) {
      action.reset().fadeIn(0.5).play();
    }
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
      // Store previous action before loading new one
      const previousAction = this.currentAction;

      // Load and play new animation
      const clip = await loadBVHAnimation(buildUrl(animation.url), this.vrm);
      if (!clip) {
        console.warn(`Failed to load animation: ${animation.url}`);
        animation.onInterrupt?.();
        this.processQueue(); // Skip failed animation
        return;
      }

      const action = this.mixer.clipAction(clip);
      action.setLoop(
        animation.loop ? THREE.LoopRepeat : THREE.LoopOnce,
        animation.loop ? Infinity : 1
      );

      this.currentAction = action;
      animation.onStart?.();

      // Crossfade from previous to new animation
      if (previousAction && previousAction.isRunning()) {
        // Crossfade: previous action fades out while new action fades in
        previousAction.crossFadeTo(action, animation.fadeInDuration, false);
      } else {
        // Otherwise, just fade in
        action.reset().fadeIn(animation.fadeInDuration);
      }

      action.play();

      // Wait for animation to complete (if not looping)
      if (!animation.loop) {
        await this.waitForAnimationComplete(action, animation);
      } else {
        // For looping animations, play for a minimum duration (2 seconds)
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
   * Wait for animation to complete
   * Polls the animation state since AnimationAction doesn't have event listeners
   */
  private waitForAnimationComplete(
    action: THREE.AnimationAction,
    animation: QueuedAnimation
  ): Promise<void> {
    return new Promise((resolve) => {
      const clip = action.getClip();
      const duration = clip.duration;
      const startTime = Date.now();
      const maxDuration = 10000; // 10 seconds max

      const checkComplete = () => {
        // Check if animation was interrupted (not current action)
        if (this.currentAction !== action || !action.isRunning()) {
          resolve();
          return;
        }

        // Check if animation has completed (time >= duration for non-looping)
        if (!animation.loop && action.time >= duration) {
          resolve();
          return;
        }

        // Safety timeout
        if (Date.now() - startTime >= maxDuration) {
          resolve();
          return;
        }

        // Continue polling (check again on next frame)
        requestAnimationFrame(checkComplete);
      };

      // Start polling
      requestAnimationFrame(checkComplete);
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
   * Check if currently playing an animation
   */
  public get isCurrentlyPlaying(): boolean {
    return this.isPlaying || (this.currentAction?.isRunning() ?? false);
  }

  /**
   * Get current animation info
   */
  public get currentAnimationInfo(): QueuedAnimation | null {
    return this.currentAnimation;
  }

  /**
   * Update animation mixer (call in animation loop)
   */
  public update(delta: number): void {
    this.mixer.update(delta);
  }
}


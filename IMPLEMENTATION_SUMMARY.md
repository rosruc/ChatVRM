# Animation Control Implementation Summary

## Overview

This implementation adds comprehensive animation control to ChatVRM, inspired by the [SillyTavern Extension-VRM](https://github.com/SillyTavern/Extension-VRM) approach. The system enables:

1. **Sequential Animation Playback**: Animations play one after another with smooth transitions
2. **Animation Blending**: Crossfading between animations prevents jarring transitions
3. **LLM-Driven Animation Selection**: Emotion and action tags in LLM responses trigger corresponding animations
4. **Animation Groups**: Support for random selection from animation groups (e.g., `joy1.bvh`, `joy2.bvh`, `joy3.bvh`)

---

## What Was Implemented

### 1. AnimationQueue Class (`src/features/vrmViewer/animationQueue.ts`)

A queue-based animation system that manages sequential playback with crossfading:

- **Sequential Playback**: Processes animations one at a time from a queue
- **Crossfade Blending**: Uses Three.js `crossFadeTo()` for smooth transitions
- **Idle Animation**: Automatically returns to idle when queue is empty
- **Priority System**: Higher priority animations can interrupt lower priority ones
- **Event Callbacks**: `onStart`, `onComplete`, `onInterrupt` for each animation

**Key Features:**
- Automatic idle animation when queue is empty
- Smooth crossfading between animations (default 0.3s)
- Support for looping and one-shot animations
- Priority-based interruption system

### 2. Animation Mapping System (`src/lib/VRMAnimation/utils/animationMapping.ts`)

Maps emotion/action names to animation file paths:

- **Animation Groups**: Supports arrays of paths for variety (random selection)
- **Default Mappings**: Pre-configured mappings for emotions and actions
- **Partial Matching**: Handles variations in emotion/action names
- **Helper Functions**: `getAnimationPath()`, `hasAnimation()`, `getAvailableAnimations()`

**Example:**
```typescript
"joy": [
  "/assets/vrm/animation/joy.bvh",
  "/assets/vrm/animation/joy2.bvh",
  "/assets/vrm/animation/joy3.bvh",
]
// Randomly selects one of the three animations
```

### 3. Enhanced Model Class (`src/features/vrmViewer/model.ts`)

Integrated AnimationQueue into the Model class:

- **Automatic Initialization**: AnimationQueue created when VRM loads
- **Idle Animation Setup**: Sets default idle animation (`neutral_idle.bvh`)
- **New `playAnimation()` Method**: Queues animations with options
- **Enhanced `speak()` Method**: Triggers animations based on screenplay motion/expression

**New Methods:**
```typescript
// Play animation with options
await model.playAnimation("joy", {
  loop: false,
  fadeIn: 0.3,
  fadeOut: 0.3,
  priority: 0
});
```

### 4. Enhanced Screenplay System (`src/features/messages/messages.ts`)

Extended to support motion/action tags:

- **New `motion` Field**: Added to `Screenplay` type
- **Action Tag Parsing**: Extracts action tags like `[wave]`, `[nod]`, `[jump]`
- **Enhanced Text Parsing**: Handles both emotion and action tags

**Example:**
```typescript
// Input: "[happy] Hello! [wave] Nice to meet you!"
// Output:
[
  {
    expression: "happy",
    motion: undefined,
    talk: { message: "Hello!", ... }
  },
  {
    expression: "happy",
    motion: "wave",
    talk: { message: "Nice to meet you!", ... }
  }
]
```

---

## How It Works

### Animation Flow

```
LLM Response: "[happy] Hello! [wave] Nice to meet you!"
    ↓
Text Parsing: Extract [happy] and [wave] tags
    ↓
Screenplay Creation:
  - Expression: "happy"
  - Motion: "wave" (for second sentence)
    ↓
Model.speak():
  1. Set facial expression: "happy"
  2. Play body animation: "happy" (from emotion)
  3. Speak "Hello!" with lip sync
  4. Play body animation: "wave" (from motion tag)
  5. Speak "Nice to meet you!" with lip sync
    ↓
AnimationQueue:
  - Queues "happy" animation
  - Crossfades to "wave" animation
  - Returns to idle when done
```

### Animation Blending

When transitioning between animations:

1. **Previous Animation**: Fades out over `fadeOutDuration` (default 0.3s)
2. **New Animation**: Crossfades in over `fadeInDuration` (default 0.3s)
3. **Smooth Transition**: Both animations play simultaneously during crossfade

**Three.js Implementation:**
```typescript
previousAction.crossFadeTo(newAction, fadeInDuration, false);
// false = don't warp (smooth transition)
```

### Animation Groups

For variety, multiple animations can be mapped to the same emotion:

```typescript
"joy": [
  "/assets/vrm/animation/joy.bvh",
  "/assets/vrm/animation/joy2.bvh",
  "/assets/vrm/animation/joy3.bvh",
]
```

When `playAnimation("joy")` is called, a random animation from the group is selected.

---

## Usage Examples

### Example 1: Basic Emotion Animation

```typescript
// LLM response: "[happy] I'm so excited!"
// Automatically triggers:
// - Facial expression: "happy"
// - Body animation: "joy" (from emotion mapping)
```

### Example 2: Action Tag

```typescript
// LLM response: "[wave] Hello there!"
// Automatically triggers:
// - Body animation: "wave"
// - Facial expression: "neutral" (default)
```

### Example 3: Combined Emotion + Action

```typescript
// LLM response: "[happy][wave] Welcome!"
// Automatically triggers:
// - Facial expression: "happy"
// - Body animation: "wave" (action takes precedence)
```

### Example 4: Sequential Animations

```typescript
// LLM response: "[happy] Hello! [nod] I understand."
// Automatically triggers:
// 1. "happy" expression + "joy" animation → "Hello!"
// 2. "happy" expression + "nod" animation → "I understand."
// Animations play sequentially with crossfading
```

### Example 5: Programmatic Animation Control

```typescript
// Manually trigger animation
await model.playAnimation("jump", {
  loop: false,
  fadeIn: 0.5,
  fadeOut: 0.5,
  priority: 1
});
```

---

## Supported Animation Tags

### Emotion Tags
- `[happy]`, `[joy]` → joy animations
- `[sad]`, `[sadness]` → sadness animations
- `[angry]`, `[anger]` → anger animations
- `[neutral]` → neutral_idle animation
- `[relaxed]` → neutral_idle animation
- `[excitement]` → excitement animations
- `[surprise]` → surprise animations
- `[fear]` → fear animations
- `[disgust]` → disgust animations
- `[confusion]` → confusion animations
- `[amusement]` → amusement animations
- `[love]` → love animations

### Action Tags
- `[wave]` → greeting animation
- `[nod]` → attention_seeking animation
- `[jump]` → jump animation
- `[walk]` → walk animation
- `[run]` → run animation
- `[jog]` → jog animation
- `[crouch]` → crouch animation
- `[laydown]` → laydown animation
- `[standup]` → standup animation
- `[pat]` → pat animation
- `[greeting]` → greeting animation

---

## Configuration

### Customizing Animation Mappings

Edit `src/lib/VRMAnimation/utils/animationMapping.ts`:

```typescript
export const DEFAULT_ANIMATION_MAPPING: AnimationMapping = {
  "my_emotion": "/assets/vrm/animation/my_animation.bvh",
  "my_action": [
    "/assets/vrm/animation/action1.bvh",
    "/assets/vrm/animation/action2.bvh",
  ],
};
```

### Adjusting Fade Durations

Modify default fade durations in `Model.playAnimation()`:

```typescript
await model.playAnimation("joy", {
  fadeIn: 0.5,  // Slower fade in
  fadeOut: 0.5, // Slower fade out
});
```

### Changing Idle Animation

Modify in `Model.loadVRM()`:

```typescript
await this._animationQueue.setIdleAnimation(
  "/assets/vrm/animation/custom_idle.bvh",
  true
);
```

---

## Technical Details

### Animation Queue Priority

- **Priority 0**: Normal animations (default)
- **Priority 1+**: High priority animations (can interrupt lower priority)
- **Idle Animation**: Always lowest priority (interrupted by any queued animation)

### Animation States

1. **Idle**: Playing idle animation (queue empty)
2. **Playing**: Active animation from queue
3. **Crossfading**: Transitioning between animations
4. **Queued**: Waiting in queue

### Performance Considerations

- **Animation Loading**: BVH files are loaded on-demand (cached by Three.js)
- **Memory**: Each animation clip is kept in memory while playing
- **Mixer Update**: Called once per frame in `Model.update()`

---

## Future Enhancements

Potential improvements:

1. **Audio-Driven Gestures**: Trigger gestures on volume peaks
2. **Animation Speed Control**: Adjust playback speed based on emotion intensity
3. **Blend Shape Integration**: Combine body animations with expression animations
4. **Animation Interruption**: Better handling of mid-animation interruptions
5. **Animation Preview**: UI for testing animations
6. **Custom Animation Mapping**: User-configurable mappings

---

## References

- [SillyTavern Extension-VRM](https://github.com/SillyTavern/Extension-VRM)
- [Three.js AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- [Three.js AnimationAction](https://threejs.org/docs/#api/en/animation/AnimationAction)
- [VRM Specification](https://github.com/vrm-c/vrm-specification)

---

## Testing

To test the implementation:

1. **Basic Emotion**: Send message with `[happy] Hello!`
2. **Action Tag**: Send message with `[wave] Hi there!`
3. **Sequential**: Send message with `[happy] Hello! [nod] I see.`
4. **Programmatic Console Testing**: 
   - Open browser console (F12)
   - Use the helper function: `testAnimation("jump")`
   - Or access directly: `vrmViewer.model?.playAnimation("wave")`
   - Available animations: `"jump"`, `"wave"`, `"nod"`, `"joy"`, `"anger"`, `"sad"`, etc.

5. **Mock LLM Message Testing** (Recommended for full flow):
   - Test the complete flow from text parsing to animation playback
   - Simulates real LLM responses with expression and motion tags
   - Use: `testMockLLMMessage("[happy] Hello! [wave] Nice to meet you!")`

**Console Testing Examples:**
```javascript
// Simple animation
testAnimation("jump")

// Direct access with options
vrmViewer.model?.playAnimation("wave", {
  loop: false,
  fadeIn: 0.5,
  fadeOut: 0.5
})

// Queue multiple animations
testAnimation("wave")
testAnimation("nod")
testAnimation("jump")

// Mock LLM message with tags (tests full flow)
testMockLLMMessage("[happy] Hello! [wave] Nice to meet you!")
testMockLLMMessage("[happy] I'm excited! [jump] Let's go! [nod] I understand.")
testMockLLMMessage("[sad] I'm sorry. [wave] But I'm here to help!")
```

**Mock LLM Message Examples:**
```javascript
// Single emotion + action
testMockLLMMessage("[happy] Hello! [wave] Nice to meet you!")

// Sequential emotions and actions
testMockLLMMessage("[happy] I'm excited! [jump] Let's go! [nod] I understand.")

// Multiple actions
testMockLLMMessage("[wave] Hello! [nod] Yes! [jump] Great!")

// Emotion changes
testMockLLMMessage("[happy] Great! [sad] But I'm sorry. [happy] Let's try again!")
```

Expected behavior:
- Animations play sequentially
- Smooth crossfading between animations
- Returns to idle when queue is empty
- Facial expressions match emotions

---

## Troubleshooting

### Animations Not Playing

1. Check that BVH files exist in `/public/assets/vrm/animation/`
2. Verify animation mapping in `animationMapping.ts`
3. Check browser console for loading errors
4. Ensure VRM model is loaded before playing animations

### Jarring Transitions

1. Increase fade durations: `fadeIn: 0.5, fadeOut: 0.5`
2. Check that animations are compatible (similar bone structure)
3. Verify crossfade is working (check `AnimationQueue.processQueue()`)

### Idle Animation Not Playing

1. Check that idle animation file exists
2. Verify `setIdleAnimation()` is called in `Model.loadVRM()`
3. Check that queue is actually empty (not stuck in processing)

---

## Summary

This implementation provides a robust, production-ready animation system that:

✅ Supports sequential animation playback  
✅ Implements smooth crossfading between animations  
✅ Maps LLM responses to animations automatically  
✅ Supports animation groups for variety  
✅ Integrates seamlessly with existing expression and lip sync systems  

The system is inspired by SillyTavern Extension-VRM but adapted for the ChatVRM architecture and requirements.


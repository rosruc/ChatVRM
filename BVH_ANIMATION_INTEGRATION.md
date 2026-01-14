# BVH Animation Integration

This document explains the BVH (Biovision Hierarchy) animation support that has been added to the ChatVRM project.

## Overview

BVH animation support has been integrated, allowing you to load and play motion capture animations in BVH format. The system automatically retargets BVH animations to VRM humanoid bones.

## Files Added

### 1. `src/lib/VRMAnimation/BVHLoader.ts`
- **Purpose**: Loads BVH files and converts them to Three.js AnimationClip and Skeleton
- **Based on**: [SillyTavern Extension-VRM BVHLoader](https://github.com/SillyTavern/Extension-VRM/blob/ae69b5adc86ea098a03443634bed2de50a497ddf/lib/jsm/loaders/BVHLoader.js)
- **Features**:
  - Parses BVH file format (HIERARCHY and MOTION sections)
  - Converts BVH bone structure to Three.js Bones
  - Creates AnimationClip with position and rotation tracks
  - Supports single-root BVH files

### 2. `src/lib/VRMAnimation/loadBVHAnimation.ts`
- **Purpose**: High-level function to load and retarget BVH animations to VRM
- **Features**:
  - Loads BVH file using BVHLoader
  - Automatically retargets to VRM humanoid bones
  - Handles VRM 0.x coordinate system conversion
  - Scales animations based on VRM model height

### 3. Updated `src/features/vrmViewer/model.ts`
- **New Methods**:
  - `loadBVHAnimation(url, loop)`: Load and play a BVH animation from URL
  - `loadBVHAnimationForEmotion(emotion, loop)`: Load BVH animation based on emotion label

## Existing Files Used

### `src/lib/VRMAnimation/utils/bvhUtils.ts`
Already existed with:
- **`emotionToBVH`**: Maps emotion labels to BVH file paths
- **`getBVHPathForEmotion(emotion)`**: Gets BVH path for an emotion
- **`retargetBVHToVRM(...)`**: Retargets BVH animation to VRM bones
- **`calculateVRMHipsHeight(vrm)`**: Calculates VRM model height for scaling

## Usage Examples

### Load BVH Animation by URL

```typescript
const action = await model.loadBVHAnimation('/path/to/animation.bvh', false);
// Plays animation once (no loop)
```

### Load BVH Animation by Emotion

```typescript
// Automatically maps emotion to BVH file path
const action = await model.loadBVHAnimationForEmotion('happy', true);
// Plays happy animation in loop
```

### Supported Emotions

The system supports these emotion labels (case-insensitive):
- `joy` / `happy` → `/assets/vrm/animation/joy.bvh`
- `angry` / `anger` → `/assets/vrm/animation/anger.bvh`
- `sad` / `sadness` → `/assets/vrm/animation/sadness.bvh`
- `excitement` → `/assets/vrm/animation/excitement.bvh`
- `surprise` → `/assets/vrm/animation/surprise.bvh`
- `fear` → `/assets/vrm/animation/fear.bvh`
- `disgust` → `/assets/vrm/animation/disgust.bvh`
- `confusion` → `/assets/vrm/animation/confusion.bvh`
- `amusement` → `/assets/vrm/animation/amusement.bvh`
- `love` → `/assets/vrm/animation/love.bvh`
- `neutral` → `/assets/vrm/animation/neutral_idle.bvh`

## How It Works

### 1. BVH File Loading
```
BVH File → BVHLoader → Three.js Skeleton + AnimationClip
```

### 2. Retargeting Process
```
BVH AnimationClip → retargetBVHToVRM() → VRM-Compatible AnimationClip
```

The retargeting process:
1. Maps BVH bone names to VRM humanoid bone names
2. Converts bone rotations to VRM coordinate system
3. Scales positions based on VRM model height
4. Handles VRM 0.x vs 1.x coordinate system differences

### 3. Animation Playback
```
VRM-Compatible Clip → AnimationMixer → AnimationAction → Plays on VRM
```

## Integration with LLM Responses

Currently, BVH animations are **not automatically triggered** by LLM responses. To integrate:

1. **Parse action tags** from LLM responses (e.g., `[wave]`, `[nod]`)
2. **Call `loadBVHAnimationForEmotion()`** when emotion tags are detected
3. **Coordinate with speech** to play animations during or after speech

### Example Integration

```typescript
// In speakCharacter or similar function
public async speak(buffer: ArrayBuffer | null, screenplay: Screenplay) {
  // Set facial expression
  this.emoteController?.playEmotion(screenplay.expression);
  
  // Play BVH animation for emotion (if available)
  await this.loadBVHAnimationForEmotion(screenplay.expression, false);
  
  // Play audio
  if (buffer) {
    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      });
    });
  }
}
```

## File Structure

```
src/lib/VRMAnimation/
├── BVHLoader.ts              # BVH file loader
├── loadBVHAnimation.ts       # High-level BVH loading function
├── VRMAnimation.ts          # VRM animation format (existing)
├── loadVRMAnimation.ts       # VRM animation loader (existing)
└── utils/
    └── bvhUtils.ts          # BVH retargeting utilities (existing)
```

## Requirements

1. **BVH Files**: Place BVH animation files in `/public/assets/vrm/animation/` (or update paths in `bvhUtils.ts`)
2. **BVH Format**: Files must use VRM-compatible bone names (hips, spine, leftArm, etc.)
3. **Single Root**: Currently only supports BVH files with a single root bone

## Limitations

1. **Single Root Only**: BVH files must have a single root bone
2. **No Animation Blending**: Animations replace each other (no blending)
3. **No Animation Queue**: Can't queue multiple animations
4. **Manual Integration**: Not automatically triggered by LLM responses (needs manual integration)

## Future Enhancements

1. **Animation Blending**: Blend between idle and gesture animations
2. **Animation Queue**: Queue multiple animations to play sequentially
3. **Action Tags**: Parse action tags from LLM (e.g., `[wave]`, `[nod]`)
4. **Multiple Roots**: Support BVH files with multiple root bones
5. **Animation Events**: Trigger events when animations start/end

## References

- [SillyTavern Extension-VRM](https://github.com/SillyTavern/Extension-VRM) - Original BVHLoader implementation
- [VRM Specification](https://github.com/vrm-c/vrm-specification) - VRM format documentation
- [BVH Format](https://research.cs.wisc.edu/graphics/Courses/cs-838-1999/Jeff/BVH.html) - BVH file format specification


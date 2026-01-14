# LLM Text & TTS Audio to VRM Control Flow

This document explains the complete flow of how text from the LLM and audio from TTS control the emotion, expression, and animations of the VRM model.

## Overview

The system has two parallel control paths:
1. **Text-based control** (from LLM): Controls facial expressions and body animations
2. **Audio-based control** (from TTS): Controls lip sync (mouth movement)

These two systems work together to create a synchronized, expressive character.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                   │
│    User types message → handleSendChat()                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. LLM STREAMING RESPONSE                                       │
│    getChatResponseStream() → OpenRouter API                      │
│    Streams text chunks in real-time                             │
│    Example: "[happy] Hello! [wave] Nice to meet you!"           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. TEXT PARSING (Real-time, sentence by sentence)              │
│    Location: index.tsx handleSendChat()                          │
│                                                                  │
│    For each sentence chunk:                                     │
│    - Extract emotion tags: [happy], [sad], [angry], etc.        │
│    - Extract action tags: [wave], [nod], [jump], etc.           │
│    - Remove tags from message text                              │
│                                                                  │
│    Example: "[happy] Hello! [wave] Nice to meet you!"            │
│    → Sentence 1: tag="[happy]", text="Hello!"                   │
│    → Sentence 2: tag="[wave]", text="Nice to meet you!"         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SCREENPLAY CREATION                                          │
│    textsToScreenplay() → messages.ts                            │
│                                                                  │
│    Converts text + tags → Screenplay object:                    │
│    {                                                             │
│      expression: "happy" | "sad" | "angry" | "neutral",        │
│      motion: "wave" | "nod" | "jump" | undefined,               │
│      talk: {                                                     │
│        message: "Hello!",                                        │
│        style: "happy",                                           │
│        speakerX: number,                                         │
│        speakerY: number                                          │
│      }                                                           │
│    }                                                             │
│                                                                  │
│    Rules:                                                        │
│    - Emotion tag → expression field                              │
│    - Action tag → motion field                                   │
│    - If no emotion tag, uses previous expression                │
│    - If no action tag, motion is undefined                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. TTS AUDIO GENERATION (Parallel to animation)                 │
│    speakCharacter() → speakCharacter.ts                         │
│    fetchAudio() → ElevenLabs API                                │
│                                                                  │
│    - Takes screenplay.talk.message                              │
│    - Sends to ElevenLabs TTS API                                │
│    - Returns audio ArrayBuffer                                  │
│    - Audio contains speech for lip sync                          │
│                                                                  │
│    Note: Audio does NOT determine expression!                    │
│    Expression comes from LLM tags, not audio content.           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. MODEL.SPEAK() - Main Orchestration                          │
│    Location: model.ts speak() method                            │
│                                                                  │
│    This is where everything comes together:                      │
│                                                                  │
│    ┌─────────────────────────────────────────────┐              │
│    │ A. FACIAL EXPRESSION CONTROL                │              │
│    │    emoteController.playEmotion(expression)   │              │
│    │    → Sets VRM blend shapes (happy/sad/etc)  │              │
│    └─────────────────────────────────────────────┘              │
│                     │                                            │
│                     ▼                                            │
│    ┌─────────────────────────────────────────────┐              │
│    │ B. BODY ANIMATION CONTROL                    │              │
│    │    if (screenplay.motion) {                  │              │
│    │      playAnimation(motion)                   │              │
│    │    } else if (expression !== "neutral") {    │              │
│    │      playAnimation(expression)                │              │
│    │    }                                         │              │
│    │                                              │              │
│    │    Priority: motion > expression > none   │              │
│    └─────────────────────────────────────────────┘              │
│                     │                                            │
│                     ▼                                            │
│    ┌─────────────────────────────────────────────┐              │
│    │ C. LIP SYNC CONTROL (if audio exists)       │              │
│    │    lipSync.playFromArrayBuffer(audioBuffer)  │              │
│    │    → Starts audio playback                   │              │
│    │    → Analyzes audio volume in real-time      │              │
│    │    → Controls mouth opening via blend shapes │              │
│    └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. ANIMATION QUEUE SYSTEM                                       │
│    Location: animationQueue.ts                                  │
│                                                                  │
│    playAnimation() → AnimationQueue.enqueue()                   │
│                                                                  │
│    Process:                                                      │
│    1. Maps emotion/action name → BVH file path                   │
│       (via animationMapping.ts)                                 │
│    2. Loads BVH animation file                                  │
│    3. Queues animation for sequential playback                  │
│    4. Crossfades from previous animation (0.3s default)         │
│    5. Plays animation                                            │
│    6. Returns to idle when queue empty                          │
│                                                                  │
│    Features:                                                     │
│    - Sequential playback (one at a time)                        │
│    - Smooth crossfading between animations                      │
│    - Automatic idle animation when queue empty                   │
│    - Priority-based interruption                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. REAL-TIME UPDATE LOOP                                         │
│    Location: viewer.ts update() → model.ts update()            │
│    Called every frame (60fps)                                   │
│                                                                  │
│    Each frame:                                                   │
│    ┌─────────────────────────────────────────────┐              │
│    │ A. LIP SYNC UPDATE                          │              │
│    │    lipSync.update()                         │              │
│    │    → Analyzes audio volume (0-1)           │              │
│    │    → Updates mouth blend shape              │              │
│    │    → Higher volume = more mouth opening     │              │
│    └─────────────────────────────────────────────┘              │
│                     │                                            │
│                     ▼                                            │
│    ┌─────────────────────────────────────────────┐              │
│    │ B. EXPRESSION UPDATE                        │              │
│    │    emoteController.update()                 │              │
│    │    → Blends lip sync with expression        │              │
│    │    → Handles auto-blink                     │              │
│    │    → Handles auto look-at                   │              │
│    └─────────────────────────────────────────────┘              │
│                     │                                            │
│                     ▼                                            │
│    ┌─────────────────────────────────────────────┐              │
│    │ C. ANIMATION UPDATE                         │              │
│    │    animationQueue.update()                  │              │
│    │    → Updates Three.js AnimationMixer        │              │
│    │    → Handles crossfading                    │              │
│    │    → Processes animation queue               │              │
│    └─────────────────────────────────────────────┘              │
│                     │                                            │
│                     ▼                                            │
│    ┌─────────────────────────────────────────────┐              │
│    │ D. VRM UPDATE                                │              │
│    │    vrm.update()                              │              │
│    │    → Applies all blend shapes                │              │
│    │    → Updates bone positions                  │              │
│    │    → Renders final frame                    │              │
│    └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Breakdown

### 1. Text Parsing & Tag Extraction

**Location**: `src/pages/index.tsx` → `handleSendChat()`

As the LLM streams text, the system:
- Detects emotion tags: `[happy]`, `[sad]`, `[angry]`, `[neutral]`, etc.
- Detects action tags: `[wave]`, `[nod]`, `[jump]`, etc.
- Splits text into sentences (by punctuation)
- Creates `Screenplay` objects for each sentence

**Example**:
```
LLM Response: "[happy] Hello! [wave] Nice to meet you!"

→ Screenplay 1:
   expression: "happy"
   motion: undefined
   talk.message: "Hello!"

→ Screenplay 2:
   expression: "happy" (carried forward)
   motion: "wave"
   talk.message: "Nice to meet you!"
```

### 2. Screenplay Creation

**Location**: `src/features/messages/messages.ts` → `textsToScreenplay()`

Converts raw text with tags into structured `Screenplay` objects:

```typescript
type Screenplay = {
  expression: "neutral" | "happy" | "angry" | "sad" | "relaxed";
  motion?: string;  // e.g., "wave", "nod", "jump"
  talk: {
    message: string;
    style: TalkStyle;
    speakerX: number;
    speakerY: number;
  };
}
```

**Key Logic**:
- Emotion tags (`[happy]`) → `expression` field
- Action tags (`[wave]`) → `motion` field
- If no emotion tag, uses previous expression (stateful)
- Tags are removed from the message text

### 3. TTS Audio Generation

**Location**: `src/features/messages/speakCharacter.ts` → `fetchAudio()`

- Takes `screenplay.talk.message` (text without tags)
- Sends to ElevenLabs TTS API
- Returns audio `ArrayBuffer`
- Audio is used ONLY for lip sync, NOT for expression

**Important**: The audio content does NOT determine the facial expression. Expression comes from LLM tags.

### 4. Facial Expression Control

**Location**: `src/features/emoteController/expressionController.ts`

**Flow**:
```
screenplay.expression → ExpressionController.playEmotion()
  → VRMExpressionManager.setValue(preset, 1.0)
    → Updates VRM blend shapes
      → Changes facial expression (happy/sad/angry/etc.)
```

**Supported Expressions**:
- `neutral` - Default, enables auto-blink
- `happy` - Happy expression
- `sad` - Sad expression
- `angry` - Angry expression
- `relaxed` - Relaxed expression

**Features**:
- Automatically resets previous expression before applying new one
- Disables auto-blink when non-neutral expression is active
- Re-enables auto-blink when returning to neutral

### 5. Body Animation Control

**Location**: `src/features/vrmViewer/model.ts` → `playAnimation()`

**Animation Selection Priority**:
1. **Motion tag** (e.g., `[wave]`) → Plays action animation
2. **Emotion tag** (e.g., `[happy]`) → Plays emotion animation
3. **None** → No animation (just expression)

**Flow**:
```
screenplay.motion or screenplay.expression
  → getAnimationPath() [animationMapping.ts]
    → Maps to BVH file path (e.g., "wave" → "/assets/vrm/animation/action_greeting.bvh")
      → AnimationQueue.enqueue()
        → Loads BVH file
          → Creates Three.js AnimationClip
            → Plays with crossfading
```

**Animation Queue Features**:
- Sequential playback (one animation at a time)
- Smooth crossfading (0.3s default)
- Automatic idle animation when queue empty
- Priority-based interruption

### 6. Lip Sync Control

**Location**: `src/features/lipSync/lipSync.ts`

**Flow**:
```
TTS Audio ArrayBuffer
  → lipSync.playFromArrayBuffer()
    → Decodes audio
      → Plays through AudioContext
        → Connects to AnalyserNode
          → Real-time volume analysis (every frame)
            → ExpressionController.lipSync("JawOpen", volume)
              → Updates mouth blend shape
```

**How It Works**:
1. Audio plays through Web Audio API
2. `AnalyserNode` analyzes audio in real-time
3. Extracts volume (amplitude) from audio signal
4. Converts volume to 0-1 range using sigmoid function
5. Updates `JawOpen` blend shape based on volume
6. Higher volume = more mouth opening

**Key Points**:
- Lip sync is **independent** of expression
- Expression (happy/sad) and lip sync (mouth opening) are blended together
- Lip sync weight is reduced when non-neutral expression is active (0.25x vs 0.5x)

### 7. Real-Time Update Loop

**Location**: `src/features/vrmViewer/viewer.ts` → `update()` → `model.update()`

Called every frame (~60fps):

```typescript
model.update(delta) {
  // 1. Analyze audio volume for lip sync
  const { volume } = lipSync.update();
  
  // 2. Update lip sync blend shape
  emoteController.lipSync("JawOpen", volume);
  
  // 3. Update expressions (blend lip sync + expression)
  emoteController.update(delta);
  
  // 4. Update animation mixer (body animations)
  animationQueue.update(delta);
  
  // 5. Apply all changes to VRM
  vrm.update(delta);
}
```

---

## Key Design Principles

### 1. Separation of Concerns

- **Text/LLM** → Controls expression and body animations
- **Audio/TTS** → Controls lip sync only
- These systems work independently but are synchronized

### 2. Expression vs Animation

- **Expression** = Facial blend shapes (happy/sad/angry)
- **Animation** = Body movement (wave/nod/jump)
- Expression can exist without animation
- Animation can exist without expression change

### 3. Stateful Expression

- Expression persists across sentences until changed
- Example: `[happy] Hello! Nice to meet you!`
  - First sentence: expression = "happy"
  - Second sentence: expression = "happy" (carried forward)

### 4. Animation Priority

1. Motion tag (`[wave]`) → Action animation
2. Emotion tag (`[happy]`) → Emotion animation
3. None → No animation

### 5. Lip Sync Blending

- Lip sync blends with expression
- Neutral expression: 50% lip sync weight
- Non-neutral expression: 25% lip sync weight
- This prevents expression from being overwhelmed by lip sync

---

## Example Flows

### Example 1: Simple Emotion

```
LLM: "[happy] I'm excited!"
  ↓
Screenplay: { expression: "happy", motion: undefined, talk: { message: "I'm excited!" } }
  ↓
1. Set facial expression: "happy"
2. Play body animation: "joy" (from emotion mapping)
3. Generate TTS audio: "I'm excited!"
4. Play audio + lip sync
```

### Example 2: Action Tag

```
LLM: "[wave] Hello there!"
  ↓
Screenplay: { expression: "neutral", motion: "wave", talk: { message: "Hello there!" } }
  ↓
1. Set facial expression: "neutral" (default)
2. Play body animation: "wave" (from motion tag)
3. Generate TTS audio: "Hello there!"
4. Play audio + lip sync
```

### Example 3: Combined Emotion + Action

```
LLM: "[happy][wave] Welcome!"
  ↓
Screenplay: { expression: "happy", motion: "wave", talk: { message: "Welcome!" } }
  ↓
1. Set facial expression: "happy"
2. Play body animation: "wave" (motion takes precedence)
3. Generate TTS audio: "Welcome!"
4. Play audio + lip sync
```

### Example 4: Sequential Animations

```
LLM: "[happy] Hello! [nod] I understand."
  ↓
Screenplay 1: { expression: "happy", motion: undefined, talk: { message: "Hello!" } }
  ↓
1. Set expression: "happy"
2. Play animation: "joy"
3. Speak: "Hello!" with lip sync
  ↓
Screenplay 2: { expression: "happy", motion: "nod", talk: { message: "I understand." } }
  ↓
1. Keep expression: "happy"
2. Crossfade to animation: "nod"
3. Speak: "I understand." with lip sync
```

---

## File Reference

### Core Files

- **Text Parsing**: `src/pages/index.tsx` (handleSendChat)
- **Screenplay Creation**: `src/features/messages/messages.ts`
- **TTS Integration**: `src/features/messages/speakCharacter.ts`
- **Model Orchestration**: `src/features/vrmViewer/model.ts`
- **Expression Control**: `src/features/emoteController/expressionController.ts`
- **Lip Sync**: `src/features/lipSync/lipSync.ts`
- **Animation Queue**: `src/features/vrmViewer/animationQueue.ts`
- **Animation Mapping**: `src/lib/VRMAnimation/utils/animationMapping.ts`

### Key Types

- `Screenplay`: Contains expression, motion, and talk data
- `QueuedAnimation`: Animation queue item with options
- `AnimationMapping`: Maps emotion/action names to BVH files

---

## Summary

The system works by:

1. **LLM provides tagged text** → Extracts emotion and action tags
2. **Text → Screenplay** → Structured data with expression, motion, and message
3. **TTS generates audio** → Audio for lip sync (independent of expression)
4. **Model.speak() orchestrates**:
   - Sets facial expression from LLM tags
   - Plays body animation from motion/emotion tags
   - Plays audio for lip sync
5. **Real-time updates** → Blends expression, animation, and lip sync every frame

The key insight is that **expression comes from LLM tags, not audio**, while **lip sync comes from audio analysis**. These two systems work together to create a synchronized, expressive character.


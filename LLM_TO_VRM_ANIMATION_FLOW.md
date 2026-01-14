# How LLM Results Control VRM Animation

This document explains the complete flow from LLM text generation to VRM character animation in the ChatVRM application.

## Overview Flow

```
LLM Response → Text Parsing → Screenplay → TTS Audio → Lip Sync Analysis → VRM Animation
                     ↓
              Expression Tags → Facial Expressions
```

## Detailed Flow

### 1. LLM Text Generation
**File**: `src/features/chat/openAiChat.ts`

- LLM responses are streamed from OpenRouter API (using models like `google/gemini-2.0-flash-exp:free`)
- Text is received incrementally via streaming
- Each chunk is processed as it arrives

**Key Code**:
```typescript
const stream = await getChatResponseStream(processedMessages, openAiKey, localOpenRouterKey)
// Streams text chunks from LLM
```

### 2. Text Parsing & Emotion Extraction
**File**: `src/pages/index.tsx` (lines 219-263)

The LLM response text is parsed to extract:
- **Emotion tags**: `[happy]`, `[sad]`, `[angry]`, `[neutral]`, `[relaxed]`
- **Sentences**: Split by punctuation (。．！？\n.!?)

**Key Code**:
```typescript
// Extract emotion tag from response
const tagMatch = receivedMessage.match(/^\[(.*?)\]/);
if (tagMatch && tagMatch[0]) {
  tag = tagMatch[0];  // e.g., "[happy]"
}

// Split into sentences
const sentenceMatch = receivedMessage.match(/^(.+[。．！？\n.!?]|.{10,}[、,])/);
```

### 3. Screenplay Conversion
**File**: `src/features/messages/messages.ts`

Text with emotion tags is converted to `Screenplay` objects containing:
- **Expression**: VRM expression preset name (happy, sad, angry, neutral, relaxed)
- **Talk**: Contains message text, talk style, and speaker parameters

**Key Code**:
```typescript
const aiTalks = textsToScreenplay([aiText], koeiroParam);
// Converts "[happy] Hello!" to:
// {
//   expression: "happy",
//   talk: { message: "Hello!", style: "happy", speakerX: ..., speakerY: ... }
// }
```

### 4. Text-to-Speech (TTS)
**File**: `src/features/messages/speakCharacter.ts` → `src/features/elevenlabs/elevenlabs.ts`

- Screenplay text is sent to ElevenLabs API for TTS
- Audio is generated with emotion-based voice style
- Returns audio as `ArrayBuffer`

**Key Code**:
```typescript
const buffer = await fetchAudio(screenplay.talk, elevenLabsKey, elevenLabsParam);
// Fetches audio from ElevenLabs API
```

### 5. Audio Playback & Lip Sync Analysis
**File**: `src/features/lipSync/lipSync.ts`

- Audio is played through Web Audio API
- Audio is analyzed in real-time using `AnalyserNode`
- Volume is extracted from time-domain data
- Volume is normalized using sigmoid function for smooth lip sync

**Key Code**:
```typescript
// Analyze audio volume
this.analyser.getFloatTimeDomainData(this.timeDomainData);
let volume = 0.0;
for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
  volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
}

// Normalize volume (sigmoid function)
volume = 1 / (1 + Math.exp(-45 * volume + 5));
if (volume < 0.1) volume = 0;  // Threshold to prevent micro-movements
```

### 6. VRM Model Animation
**File**: `src/features/vrmViewer/model.ts`

The `Model.speak()` method:
1. **Sets facial expression** based on emotion tag from screenplay
2. **Plays audio** through lip sync system
3. **Updates lip sync** in animation loop

**Key Code**:
```typescript
public async speak(buffer: ArrayBuffer | null, screenplay: Screenplay) {
  // Set facial expression from emotion tag
  if (this.prevPlayedEmotion !== screenplay.expression) {
    this.emoteController?.playEmotion(screenplay.expression);
    this.prevPlayedEmotion = screenplay.expression;
  }
  
  // Play audio for lip sync
  await new Promise((resolve) => {
    this._lipSync?.playFromArrayBuffer(buffer, () => {
      resolve(true);
    });
  });
}
```

### 7. Continuous Animation Loop
**File**: `src/features/vrmViewer/viewer.ts` (line 152-163)

The animation loop runs continuously via `requestAnimationFrame`:
- Updates lip sync volume from audio analysis
- Applies lip sync to VRM blend shapes (JawOpen, MouthStretch, etc.)
- Updates facial expressions
- Updates VRM model

**Key Code**:
```typescript
public update = () => {
  requestAnimationFrame(this.update);
  const delta = this._clock.getDelta();
  
  if (this.model) {
    this.model.update(delta);  // Updates lip sync and expressions
  }
  
  // Render frame
  this._renderer.render(this._scene, this._camera);
};
```

**Model.update()** (in `model.ts`):
```typescript
public update(delta: number): void {
  if (this._lipSync) {
    const { volume } = this._lipSync.update();  // Get current audio volume
    
    // Apply lip sync to jaw/mouth blend shapes
    this.emoteController?.lipSync("JawOpen", volume);
  }
  
  this.emoteController?.update(delta);  // Update expressions
  this.mixer?.update(delta);            // Update animations
  this.vrm?.update(delta);              // Update VRM
}
```

### 8. Expression Controller
**File**: `src/features/emoteController/expressionController.ts`

Manages VRM facial expressions:
- **Emotions**: Sets blend shape values for preset expressions (happy, sad, angry, etc.)
- **Lip Sync**: Applies volume-based jaw/mouth movements
- **Auto Blink**: Handles automatic blinking when in neutral expression
- **Auto Look At**: Controls eye gaze direction

**Key Code**:
```typescript
public lipSync(preset: VRMExpressionPresetName, value: number) {
  // Store current lip sync state
  this._currentLipSync = { preset, value };
}

public update(delta: number) {
  if (this._currentLipSync) {
    // Apply lip sync with weight based on current emotion
    const weight = this._currentEmotion === "neutral"
      ? this._currentLipSync.value * 0.5
      : this._currentLipSync.value * 0.25;
    this._expressionManager?.setValue(this._currentLipSync.preset, weight);
  }
}
```

## Key Components Summary

1. **LLM Streaming** (`openAiChat.ts`): Streams text from OpenRouter API
2. **Text Processing** (`index.tsx`): Parses emotion tags and sentences
3. **Screenplay** (`messages.ts`): Converts text to structured format with expressions
4. **TTS** (`elevenlabs.ts`): Converts text to audio
5. **Lip Sync** (`lipSync.ts`): Analyzes audio volume in real-time
6. **Model** (`model.ts`): Coordinates expression and lip sync
7. **Expression Controller** (`expressionController.ts`): Applies blend shapes to VRM
8. **Animation Loop** (`viewer.ts`): Continuously updates and renders VRM

## Emotion Tag Format

The LLM should output text with emotion tags like:
- `[happy] Hello, how are you?`
- `[sad] I'm sorry to hear that.`
- `[angry] That's not acceptable!`
- `[neutral] Let me think about that.`
- `[relaxed] Take it easy.`

These tags control both:
1. **Facial expression** (blend shapes for eyes, eyebrows, mouth)
2. **Voice style** (passed to ElevenLabs TTS)

## Lip Sync Mechanism

The lip sync uses:
- **Audio analysis**: Real-time volume extraction from audio stream
- **Sigmoid normalization**: Smooths volume values (line 26 in `lipSync.ts`)
- **Threshold filtering**: Prevents micro-movements (volume < 0.1 → 0)
- **Blend shape control**: Maps volume to `JawOpen` blend shape (or `aa` preset)

The formula `1 / (1 + Math.exp(-45 * volume + 5))` creates a smooth S-curve that:
- Keeps mouth closed for low volumes
- Opens mouth proportionally for higher volumes
- Prevents sudden jumps

## Action Animations (Body Movements)

### Current State: **NOT IMPLEMENTED**

Currently, **only emotion tags control facial expressions**. There is **no system for action/gesture animations** triggered by LLM responses.

### What Exists:

1. **Idle Animation**: 
   - Only one body animation is loaded: `idle_loop.vrma` (in `/public/` folder)
   - This animation plays continuously in a loop when the VRM model loads
   - **File**: `src/features/vrmViewer/viewer.ts` (line 59-60)

2. **VRMAnimation Infrastructure**:
   - The codebase has full support for VRM animation files (`.vrma` format)
   - `VRMAnimation` class can handle:
     - **Humanoid tracks**: Body movements (bone rotations, translations)
     - **Expression tracks**: Facial expressions
     - **Look-at tracks**: Eye gaze animations
   - **File**: `src/lib/VRMAnimation/VRMAnimation.ts`

3. **Animation Loading**:
   - `Model.loadAnimation()` method can load and play any `.vrma` file
   - Uses Three.js `AnimationMixer` to play animations
   - **File**: `src/features/vrmViewer/model.ts` (lines 63-72)

### What's Missing:

1. **No Action Tags**: 
   - LLM responses don't parse action/gesture tags (e.g., `[wave]`, `[nod]`, `[point]`)
   - Only emotion tags are parsed: `[happy]`, `[sad]`, `[angry]`, `[neutral]`, `[relaxed]`

2. **No Dynamic Animation Triggering**:
   - No way to trigger different `.vrma` files based on LLM response content
   - No connection between text parsing and animation selection
   - No animation queue or playback system for actions

3. **No Animation Library**:
   - Only `idle_loop.vrma` exists in the project
   - No gesture/action animation files (wave, nod, point, etc.)

### How to Add Action Animations (Potential Implementation):

To add action animations, you would need to:

1. **Create/Obtain Animation Files**:
   - Create or download `.vrma` files for desired actions (wave, nod, point, etc.)
   - Place them in `/public/` folder

2. **Extend Text Parsing**:
   - Modify `textsToScreenplay()` in `messages.ts` to parse action tags
   - Add action field to `Screenplay` type:
     ```typescript
     export type Screenplay = {
       expression: EmotionType;
       action?: string;  // e.g., "wave", "nod", "point"
       talk: Talk;
     };
     ```

3. **Add Animation Management**:
   - Extend `Model` class to handle action animations
   - Add method to play action animations on demand:
     ```typescript
     public async playAction(actionName: string): Promise<void> {
       const vrma = await loadVRMAnimation(buildUrl(`/${actionName}.vrma`));
       if (vrma) {
         const clip = vrma.createAnimationClip(this.vrm!);
         const action = this.mixer!.clipAction(clip);
         action.reset().play();
         // Wait for animation to complete
         await new Promise(resolve => {
           action.addEventListener('finished', resolve);
         });
       }
     }
     ```

4. **Update System Prompt**:
   - Modify `systemPromptConstants.ts` to instruct LLM to use action tags
   - Example: `[wave][happy] Hello!` or `[nod][neutral] I understand.`

5. **Integrate with Speak Flow**:
   - Modify `Model.speak()` to check for action tags and play animations before/after speech

### Current Animation System:

```
LLM Response → Emotion Tags → Facial Expressions ✅
                ↓
           Action Tags → Body Animations ❌ (Not implemented)
```

**Only the idle loop animation plays continuously**, independent of LLM responses.


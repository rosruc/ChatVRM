# VRM Viewer Architecture Explanation

This document explains the two core files that manage the 3D VRM character: `model.ts` and `viewer.ts`.

## Overview

```
Viewer (viewer.ts)
  └── Manages 3D scene, rendering, camera
      └── Contains Model (model.ts)
          └── Manages VRM character, animations, expressions, lip sync
```

## File 1: `model.ts` - VRM Character Controller

**Purpose**: Manages the VRM character itself - loading, expressions, lip sync, and animations.

### Key Responsibilities

1. **VRM Model Loading**
2. **Animation Management**
3. **Speech & Lip Sync**
4. **Expression Control**
5. **Update Loop (called by Viewer)**

### Class Structure

```typescript
export class Model {
  public vrm?: VRM | null;              // The VRM model instance
  public mixer?: THREE.AnimationMixer;  // Animation mixer for playing animations
  public emoteController?: EmoteController; // Controls facial expressions
  
  private _lookAtTargetParent: THREE.Object3D; // Camera reference for eye tracking
  private _lipSync?: LipSync;            // Audio analysis for lip sync
  private prevPlayedEmotion: string | null;    // Prevents expression flickering
}
```

### Key Methods

#### 1. `loadVRM(url: string)`
**Purpose**: Loads a VRM model file from a URL.

**What it does**:
- Creates a GLTF loader with VRM plugin
- Loads the `.vrm` file
- Initializes the VRM model
- Creates an `AnimationMixer` for playing animations
- Creates an `EmoteController` for facial expressions

**Key Code**:
```typescript
const gltf = await loader.loadAsync(url);
const vrm = (this.vrm = gltf.userData.vrm);
this.mixer = new THREE.AnimationMixer(vrm.scene);
this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);
```

#### 2. `loadAnimation(vrmAnimation: VRMAnimation)`
**Purpose**: Loads and plays a VRM animation file (`.vrma` format).

**What it does**:
- Takes a `VRMAnimation` object (loaded from `.vrma` file)
- Creates an animation clip from it
- Plays it on the animation mixer

**Key Code**:
```typescript
const clip = vrmAnimation.createAnimationClip(vrm);
const action = mixer.clipAction(clip);
action.play();  // Starts playing the animation
```

**Current Usage**: Only used once to load `idle_loop.vrma` (see `viewer.ts` line 60)

#### 3. `speak(buffer: ArrayBuffer | null, screenplay: Screenplay)`
**Purpose**: Makes the character speak with lip sync and facial expressions.

**What it does**:
1. **Sets facial expression** from screenplay emotion tag (happy, sad, etc.)
   - Prevents flickering by checking if emotion changed
2. **Plays audio** if buffer is provided
   - Audio is played through `LipSync` class
   - Waits for audio to finish before resolving

**Flow**:
```
Screenplay → Expression → EmoteController → VRM Blend Shapes
         → Audio Buffer → LipSync → Real-time Volume Analysis
```

**Key Code**:
```typescript
// Set expression if changed
if (this.prevPlayedEmotion !== screenplay.expression) {
  this.emoteController?.playEmotion(screenplay.expression);
  this.prevPlayedEmotion = screenplay.expression;
}

// Play audio for lip sync
await new Promise((resolve) => {
  this._lipSync?.playFromArrayBuffer(buffer, () => {
    resolve(true);  // Resolves when audio finishes
  });
});
```

#### 4. `update(delta: number)`
**Purpose**: Called every frame to update animations, lip sync, and expressions.

**What it does** (in order):
1. **Lip Sync Update**:
   - Gets current audio volume from `LipSync` analyzer
   - Applies volume to jaw/mouth blend shapes
   - Uses `JawOpen` blend shape (or `aa` preset as fallback)

2. **Expression Update**:
   - Updates facial expressions via `EmoteController`
   - Handles auto-blink, look-at, etc.

3. **Animation Update**:
   - Updates animation mixer (plays body animations)
   - Updates VRM model

**Key Code**:
```typescript
// Get audio volume for lip sync
const { volume } = this._lipSync.update();

// Apply to jaw/mouth
this.emoteController?.lipSync("JawOpen", volume);

// Update all systems
this.emoteController?.update(delta);  // Expressions
this.mixer?.update(delta);            // Body animations
this.vrm?.update(delta);              // VRM model
```

**Called by**: `viewer.ts` in the animation loop (every frame)

---

## File 2: `viewer.ts` - 3D Scene Manager

**Purpose**: Manages the entire 3D scene - rendering, camera, lighting, and coordinates the Model.

### Key Responsibilities

1. **3D Scene Setup** (lighting, camera, renderer)
2. **VRM Loading Coordination**
3. **Rendering Loop**
4. **Camera Controls**
5. **Canvas Management**

### Class Structure

```typescript
export class Viewer {
  public isReady: boolean;              // Whether viewer is initialized
  public model?: Model;                 // The VRM character model
  
  private _renderer?: THREE.WebGLRenderer;  // WebGL renderer
  private _clock: THREE.Clock;          // Time tracking for animations
  private _scene: THREE.Scene;          // 3D scene container
  private _camera?: THREE.PerspectiveCamera;  // Camera
  private _cameraControls?: OrbitControls;    // Mouse/touch camera controls
}
```

### Key Methods

#### 1. `constructor()`
**Purpose**: Initializes the 3D scene with lighting.

**What it does**:
- Creates a Three.js Scene
- Adds directional light (main light source)
- Adds ambient light (fills shadows)
- Creates a Clock for time tracking

**Key Code**:
```typescript
const scene = new THREE.Scene();
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
this._clock = new THREE.Clock();
```

#### 2. `setup(canvas: HTMLCanvasElement)`
**Purpose**: Sets up rendering on a canvas element (called from React component).

**What it does**:
1. **Creates WebGL Renderer**:
   - Attaches to canvas
   - Sets size and pixel ratio
   - Enables alpha (transparency)

2. **Creates Camera**:
   - Perspective camera (20° field of view)
   - Positioned at (0, 1.3, 1.5) - slightly above and in front
   - Looks at character head level

3. **Creates Camera Controls**:
   - OrbitControls for mouse/touch interaction
   - Allows rotating, zooming, panning

4. **Starts Animation Loop**:
   - Calls `update()` which runs every frame

**Key Code**:
```typescript
this._renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,      // Transparent background
  antialias: true,  // Smooth edges
});

this._camera = new THREE.PerspectiveCamera(20.0, width / height, 0.1, 20.0);
this._camera.position.set(0, 1.3, 1.5);  // Position camera

this._cameraControls = new OrbitControls(this._camera, this._renderer.domElement);
this.update();  // Start animation loop
```

#### 3. `loadVrm(url: string)`
**Purpose**: Loads a VRM model and sets it up in the scene.

**What it does**:
1. **Creates Model instance**:
   - Passes camera reference (for eye tracking)

2. **Loads VRM file**:
   - Calls `model.loadVRM(url)`

3. **Adds to Scene**:
   - Adds VRM model to Three.js scene
   - Disables frustum culling (always render, even if off-screen)

4. **Loads Idle Animation**:
   - Loads `idle_loop.vrma` from `/public/` folder
   - Plays it continuously

5. **Adjusts Camera**:
   - Resets camera position based on character's head position

**Key Code**:
```typescript
this.model = new Model(this._camera || new THREE.Object3D());
this.model.loadVRM(url).then(async () => {
  this._scene.add(this.model.vrm.scene);  // Add to scene
  
  // Load and play idle animation
  const vrma = await loadVRMAnimation(buildUrl("/idle_loop.vrma"));
  if (vrma) this.model.loadAnimation(vrma);
  
  this.resetCamera();  // Adjust camera
});
```

#### 4. `update()`
**Purpose**: Main animation loop - called every frame via `requestAnimationFrame`.

**What it does** (in order):
1. **Schedules next frame**: `requestAnimationFrame(this.update)`
2. **Calculates delta time**: Time since last frame
3. **Updates Model**: Calls `model.update(delta)` which updates:
   - Lip sync
   - Facial expressions
   - Body animations
   - VRM model
4. **Renders frame**: Draws everything to canvas

**Key Code**:
```typescript
public update = () => {
  requestAnimationFrame(this.update);  // Schedule next frame
  const delta = this._clock.getDelta();  // Get time delta
  
  if (this.model) {
    this.model.update(delta);  // Update character
  }
  
  if (this._renderer && this._camera) {
    this._renderer.render(this._scene, this._camera);  // Draw frame
  }
};
```

**Runs at**: ~60 FPS (browser refresh rate)

#### 5. `resetCamera()`
**Purpose**: Adjusts camera position based on character's head position.

**What it does**:
- Gets the VRM's head bone position
- Adjusts camera Y position to match head height
- Updates camera target to look at head

**Why**: Different VRM models have different heights, so camera needs adjustment.

#### 6. `resize()`
**Purpose**: Handles window resize events.

**What it does**:
- Updates renderer size
- Updates camera aspect ratio
- Maintains proper rendering when window size changes

---

## How They Work Together

### Initialization Flow

```
1. React Component (vrmViewer.tsx)
   └── Creates Viewer instance
       └── Calls viewer.setup(canvas)
           └── Sets up renderer, camera, controls
           └── Starts animation loop (update())

2. React Component
   └── Calls viewer.loadVrm(url)
       └── Creates Model instance
       └── Calls model.loadVRM(url)
           └── Loads VRM file
           └── Creates mixer, emoteController
       └── Loads idle_loop.vrma
       └── Adds model to scene
```

### Runtime Flow

```
Every Frame (60 FPS):
  viewer.update()
    ├── Calculate delta time
    ├── model.update(delta)
    │   ├── lipSync.update() → Get audio volume
    │   ├── emoteController.lipSync(volume) → Move jaw/mouth
    │   ├── emoteController.update(delta) → Update expressions
    │   ├── mixer.update(delta) → Play body animations
    │   └── vrm.update(delta) → Update VRM
    └── renderer.render(scene, camera) → Draw to canvas
```

### Speech Flow

```
User Input / LLM Response
  └── speakCharacter()
      └── model.speak(audioBuffer, screenplay)
          ├── emoteController.playEmotion(expression)
          │   └── Sets facial expression blend shapes
          └── lipSync.playFromArrayBuffer(buffer)
              └── Plays audio
              └── Analyzes volume in real-time
              └── model.update() applies volume to jaw
```

---

## Key Concepts

### Animation Mixer
- **Purpose**: Plays and blends multiple animations
- **Usage**: Currently only plays `idle_loop.vrma` continuously
- **Potential**: Could play multiple animations (idle + gestures)

### Lip Sync
- **Real-time**: Analyzes audio as it plays
- **Volume-based**: Uses audio volume to control jaw opening
- **Smooth**: Sigmoid function prevents jerky movements

### Expression Controller
- **Blend Shapes**: VRM uses blend shapes for facial expressions
- **Presets**: happy, sad, angry, neutral, relaxed
- **Auto-features**: Auto-blink, auto look-at (eye tracking)

### Scene Graph
```
Scene (viewer.ts)
  └── Lights (directional, ambient)
  └── VRM Model (model.ts)
      └── Bones (skeleton)
      └── Mesh (3D model)
      └── Blend Shapes (facial expressions)
```

---

## Current Limitations

1. **Only Idle Animation**: Only `idle_loop.vrma` is loaded and played
2. **No Action Animations**: No system to trigger gestures from LLM responses
3. **Single Animation**: Animation mixer could handle multiple animations but doesn't
4. **No Animation Queue**: Can't queue animations to play sequentially

---

## Potential Enhancements

1. **Action Animation System**:
   - Parse action tags from LLM: `[wave]`, `[nod]`, etc.
   - Load corresponding `.vrma` files
   - Play animations on demand

2. **Animation Blending**:
   - Blend idle animation with gesture animations
   - Smooth transitions between animations

3. **Animation Queue**:
   - Queue multiple animations
   - Play sequentially or in parallel

4. **Expression + Animation Sync**:
   - Coordinate facial expressions with body animations
   - Example: Wave + happy expression


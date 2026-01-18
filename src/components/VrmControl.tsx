"use client";

import { useContext, useMemo, useState } from "react";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { MOTIONS } from "@/features/characterRuntime/motionCatalog";
import { VRM, type VRMExpressionPresetName } from "@pixiv/three-vrm";

const MOODS: VRMExpressionPresetName[] = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
];

export default function VrmControl() {
  const { viewer } = useContext(ViewerContext);
  const model = viewer.model;

  const [mood, setMood] = useState<VRMExpressionPresetName>("neutral");
  const [emote, setEmote] = useState<VRMExpressionPresetName>("happy");
  const [emoteWeight, setEmoteWeight] = useState(0.35);
  const [emoteDuration, setEmoteDuration] = useState(1.0);

  const [sineKey, setSineKey] = useState<string>("happy");
  const [sineDuration, setSineDuration] = useState(0.8);
  const [sineMin, setSineMin] = useState(0.0);
  const [sineMax, setSineMax] = useState(0.6);
  const [sineCycles, setSineCycles] = useState(1);

  const disabled = !model;

  return (
    <div
      className="fixed right-4 top-4 z-20 bg-base border-2 border-primary rounded-8 shadow-lg w-[360px] max-h-[85vh] overflow-auto"
      style={{ marginTop: "120px" }}
    >
      <div className="px-12 py-10 border-b border-primary/30">
        <div className="text-sm font-bold">VRM Control (Test)</div>
        <div className="text-xs opacity-70 mt-1">
          {model ? "Model loaded" : "Model not loaded yet"}
        </div>
      </div>

      <div className="p-12 space-y-12">
        <section className="space-y-8">
          <div className="text-xs font-bold opacity-80">Expression</div>

          <div className="space-y-6">
            <div className="flex items-center gap-8">
              <label className="text-xs w-16 opacity-70">Mood</label>
              <select
                className="flex-1 bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={mood}
                onChange={(e) =>
                  setMood(e.target.value as VRMExpressionPresetName)
                }
                disabled={disabled}
              >
                {MOODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                className="bg-secondary hover:bg-secondary-hover rounded-6 px-8 py-6 text-xs font-bold"
                disabled={disabled}
                onClick={() => model?.emoteController?.playEmotion(mood)}
              >
                Apply
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-8">
                <label className="text-xs w-16 opacity-70">Emote</label>
                <select
                  className="flex-1 bg-surface1 rounded-6 px-8 py-6 text-xs"
                  value={emote}
                  onChange={(e) =>
                    setEmote(e.target.value as VRMExpressionPresetName)
                  }
                  disabled={disabled}
                >
                  {MOODS.filter((p) => p !== "neutral").map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-8">
                <label className="text-xs w-16 opacity-70">Weight</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="flex-1 bg-surface1 rounded-6 px-8 py-6 text-xs"
                  value={emoteWeight}
                  onChange={(e) => setEmoteWeight(Number(e.target.value))}
                  disabled={disabled}
                />
              </div>

              <div className="flex items-center gap-8">
                <label className="text-xs w-16 opacity-70">Duration</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  className="flex-1 bg-surface1 rounded-6 px-8 py-6 text-xs"
                  value={emoteDuration}
                  onChange={(e) => setEmoteDuration(Number(e.target.value))}
                  disabled={disabled}
                />
              </div>

              <button
                className="w-full bg-secondary hover:bg-secondary-hover rounded-6 px-10 py-8 text-xs font-bold"
                disabled={disabled}
                onClick={() =>
                  model?.emoteController?.playEmote(emote, {
                    weight: emoteWeight,
                    durationSec: emoteDuration,
                  })
                }
              >
                Play Emote Overlay
              </button>
            </div>
          </div>

          <div className="pt-8 border-t border-primary/20 space-y-6">
            <div className="text-xs font-bold opacity-80">Sine Wave</div>
            <div className="flex items-center gap-8">
              <label className="text-xs w-16 opacity-70">Key</label>
              <input
                className="flex-1 bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={sineKey}
                onChange={(e) => setSineKey(e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-8">
              <input
                type="number"
                step={0.1}
                min={0.05}
                className="bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={sineDuration}
                onChange={(e) => setSineDuration(Number(e.target.value))}
                disabled={disabled}
                title="durationSec"
              />
              <input
                type="number"
                step={1}
                className="bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={sineCycles}
                onChange={(e) => setSineCycles(Number(e.target.value))}
                disabled={disabled}
                title="cycles (-1 = loop)"
              />
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                className="bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={sineMin}
                onChange={(e) => setSineMin(Number(e.target.value))}
                disabled={disabled}
                title="minWeight"
              />
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                className="bg-surface1 rounded-6 px-8 py-6 text-xs"
                value={sineMax}
                onChange={(e) => setSineMax(Number(e.target.value))}
                disabled={disabled}
                title="maxWeight"
              />
            </div>
            <button
              className="w-full bg-secondary hover:bg-secondary-hover rounded-6 px-10 py-8 text-xs font-bold"
              disabled={disabled}
              onClick={() =>
                model?.emoteController?.playExpressionSineWave(sineKey, {
                  durationSec: sineDuration,
                  minWeight: sineMin,
                  maxWeight: sineMax,
                  cycles: sineCycles,
                })
              }
            >
              Play Sine Wave
            </button>
          </div>
        </section>

        <VRMMotionControl />

        <div className="pt-8 border-t border-primary/20">
          <button
            className="w-full bg-primary hover:bg-primary/90 rounded-6 px-10 py-8 text-xs font-bold text-white"
            disabled={disabled}
            onClick={async () => {
              if (!model) return;
              await viewer.setStateBVH(
                "/assets/vrm/animation/bvh/neutral_idle.bvh",
                true
              );
              model.emoteController?.playEmotion("neutral");
            }}
          >
            Reset (Idle + Neutral)
          </button>
        </div>
      </div>
    </div>
  );
}

export function VRMMotionControl() {
  const { viewer } = useContext(ViewerContext);
  const model = viewer.model;

  const [customBvhUrl, setCustomBvhUrl] = useState(
    "/assets/vrm/animation/bvh/action_greeting.bvh"
  );
  const [customVrmaUrl, setCustomVrmaUrl] = useState(
    "/assets/vrm/animation/vrma/LookAround.vrma"
  );

  const { stateMotions, quirkMotions } = useMemo(() => {
    const values = Object.values(MOTIONS);
    return {
      stateMotions: values.filter((m) => m.kind === "state"),
      quirkMotions: values.filter((m) => m.kind === "quirk"),
    };
  }, []);

  const disabled = !model;
  return (
    <section className="space-y-8">
      <div className="text-xs font-bold opacity-80">Motion</div>

      <div className="space-y-6">
        <div className="text-xs opacity-70">State motions (looping)</div>
        <div className="flex flex-wrap gap-6">
          {stateMotions.map((m) => (
            <button
              key={m.id}
              className="bg-surface1 hover:bg-surface1-hover rounded-6 px-8 py-6 text-xs"
              disabled={disabled}
              onClick={async () => {
                if (!model) return;
                if (m.format === "bvh") {
                  await viewer.setStateBVH(m.url, true);
                } else {
                  await viewer.setStateVRMA(m.url, true);
                }
                if (m.expression?.mood) {
                  model.emoteController?.playEmotion(m.expression.mood);
                }
              }}
            >
              {m.id}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="text-xs opacity-70">Quirk motions (one-shot)</div>
        <div className="flex flex-wrap gap-6">
          {quirkMotions.map((m) => (
            <button
              key={m.id}
              className="bg-surface1 hover:bg-surface1-hover rounded-6 px-8 py-6 text-xs"
              disabled={disabled}
              onClick={async () => {
                if (!model) return;
                if (m.expression?.emote) {
                  model.emoteController?.playEmote(m.expression.emote, {
                    weight: m.expression.emoteWeight,
                    durationSec: m.expression.emoteDurationSec,
                  });
                }
                if (m.format === "vrma") {
                  await viewer.loadVRMA(m.url, false);
                } else {
                  await viewer.loadBVH(m.url, false);
                }
              }}
            >
              {m.id}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-8 border-t border-primary/20 space-y-6">
        <div className="text-xs opacity-70">Custom BVH / VRMA</div>
        <div className="space-y-6">
          <input
            className="w-full bg-surface1 rounded-6 px-8 py-6 text-xs"
            value={customBvhUrl}
            onChange={(e) => setCustomBvhUrl(e.target.value)}
            disabled={disabled}
          />
          <button
            className="w-full bg-secondary hover:bg-secondary-hover rounded-6 px-10 py-8 text-xs font-bold"
            disabled={disabled}
            onClick={() => viewer.loadBVH(customBvhUrl, false)}
          >
            Play BVH Once
          </button>

          <input
            className="w-full bg-surface1 rounded-6 px-8 py-6 text-xs"
            value={customVrmaUrl}
            onChange={(e) => setCustomVrmaUrl(e.target.value)}
            disabled={disabled}
          />
          <button
            className="w-full bg-secondary hover:bg-secondary-hover rounded-6 px-10 py-8 text-xs font-bold"
            disabled={disabled}
            onClick={() => viewer.loadVRMA(customVrmaUrl, false)}
          >
            Play VRMA Once
          </button>
        </div>
      </div>
    </section>
  );
}

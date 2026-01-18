import { useContext, useState } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";

// List of all available BVH animation files
const BVH_ANIMATIONS = [
  "action_attention_seeking.bvh",
  "action_crawling.bvh",
  "action_crouch.bvh",
  "action_gaming.bvh",
  "action_greeting.bvh",
  "action_greeting1.bvh",
  "action_jog.bvh",
  "action_jump.bvh",
  "action_laydown.bvh",
  "action_pat.bvh",
  "action_pickingup.bvh",
  "action_run.bvh",
  "action_standup.bvh",
  "action_walk.bvh",
  "admiration.bvh",
  "admiration2.bvh",
  "admiration3.bvh",
  "amusement.bvh",
  "amusement2.bvh",
  "amusement3.bvh",
  "anger.bvh",
  "anger2.bvh",
  "anger3.bvh",
  "annoyance.bvh",
  "annoyance1.bvh",
  "approval.bvh",
  "approval2.bvh",
  "approval3.bvh",
  "caring.bvh",
  "caring1.bvh",
  "confusion.bvh",
  "confusion2.bvh",
  "confusion3.bvh",
  "curiosity.bvh",
  "curiosity2.bvh",
  "curiosity3.bvh",
  "dance_1.bvh",
  "dance_2.bvh",
  "dance_backup.bvh",
  "dance_dab.bvh",
  "dance_gangnam_style.bvh",
  "dance_headdrop.bvh",
  "dance_marachinostep.bvh",
  "dance_northern_soul_spin.bvh",
  "dance_ontop.bvh",
  "dance_pushback.bvh",
  "dance_rumba.bvh",
  "desire.bvh",
  "desire1.bvh",
  "desire2.bvh",
  "disappointment.bvh",
  "disappointment2.bvh",
  "disapproval.bvh",
  "disaproval1.bvh",
  "disgust.bvh",
  "disgust1.bvh",
  "disgust2.bvh",
  "embarrassment.bvh",
  "excitement.bvh",
  "excitement2.bvh",
  "excitement3.bvh",
  "exercise_crunch.bvh",
  "exercise_crunches.bvh",
  "exercise_jogging.bvh",
  "exercise_jumping_jacks.bvh",
  "fear.bvh",
  "fear2.bvh",
  "fear3.bvh",
  "gratitude.bvh",
  "grief.bvh",
  "hitarea_butt.bvh",
  "hitarea_chest.bvh",
  "hitarea_foot.bvh",
  "hitarea_groin.bvh",
  "hitarea_hands.bvh",
  "hitarea_head.bvh",
  "hitarea_leg.bvh",
  "joy.bvh",
  "joy2.bvh",
  "joy3.bvh",
  "kneel_idle.bvh",
  "kneel_idle2.bvh",
  "laying_idle.bvh",
  "laying_idle2.bvh",
  "laying_idle3.bvh",
  "love.bvh",
  "love2.bvh",
  "love3.bvh",
  "nervousnes3.bvh",
  "nervousness.bvh",
  "nervousness2.bvh",
  "neutral_idle.bvh",
  "neutral_idle2.bvh",
  "neutral.bvh",
  "neutral2.bvh",
  "neutral3.bvh",
  "neutral4.bvh",
  "optimism.bvh",
  "pride.bvh",
  "pride2.bvh",
  "reaction_groinhit.bvh",
  "reaction_headshot.bvh",
  "realization.bvh",
  "relief.bvh",
  "relief1.bvh",
  "remorse.bvh",
  "remorse2.bvh",
  "remorse3.bvh",
  "sadness.bvh",
  "sadness2.bvh",
  "sit_idle.bvh",
  "sit_idle2.bvh",
  "sit_idle3.bvh",
  "sit_idle4.bvh",
  "surprise.bvh",
  "surprise2.bvh",
].sort();

export function MotionBVHList() {
  const { viewer } = useContext(ViewerContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredAnimations = BVH_ANIMATIONS.filter((anim) =>
    anim.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAnimationClick = async (filename: string) => {
    if (!viewer.model) {
      console.warn("VRM model not loaded yet");
      return;
    }

    try {
      const animationPath = `/assets/vrm/animation/bvh/${filename}`;
      await viewer.loadBVH(animationPath, false);
      console.log(`Playing animation: ${filename}`);
    } catch (error) {
      console.error(`Failed to play animation ${filename}:`, error);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-20 bg-base border-2 border-primary rounded-8 shadow-lg max-w-xs w-80">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-12 py-8 text-left font-bold text-text-primary hover:bg-surface1-hover rounded-t-8 flex items-center justify-between"
      >
        <span>Motion List ({BVH_ANIMATIONS.length})</span>
        <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
      </button>

      {isOpen && (
        <div
          className="border-t border-primary flex flex-col"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          <div className="p-8 pb-4">
            <input
              type="text"
              placeholder="Search animations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-8 py-4 bg-surface1 hover:bg-surface1-hover rounded-4 text-text-primary typography-14 font-M_PLUS_2"
            />
          </div>
          <div
            className="px-8 pb-8 flex-1 overflow-y-auto"
            style={{ minHeight: 0 }}
          >
            {filteredAnimations.length === 0 ? (
              <div className="text-text-secondary text-center py-8 typography-14">
                No animations found
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAnimations.map((filename) => (
                  <button
                    key={filename}
                    onClick={() => handleAnimationClick(filename)}
                    className="w-full px-8 py-4 text-left bg-surface1 hover:bg-surface1-hover active:bg-surface1-press rounded-4 text-text-primary typography-12 font-M_PLUS_2 transition-colors"
                  >
                    {filename.replace(".bvh", "")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

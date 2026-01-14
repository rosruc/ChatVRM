import { useContext, useState } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";

// List of all available VRMA animation files
const VRMA_ANIMATIONS = [
  "001_motion_pose.vrma",
  "002_dogeza.vrma",
  "003_humidai.vrma",
  "004_hello_1.vrma",
  "005_smartphone.vrma",
  "006_drinkwater.vrma",
  "007_gekirei.vrma",
  "008_gatan.vrma",
  "Angry.vrma",
  "Blush.vrma",
  "Clapping.vrma",
  "Goodbye.vrma",
  "Jump.vrma",
  "LookAround.vrma",
  "Relax.vrma",
  "Sad.vrma",
  "Sleepy.vrma",
  "Surprised.vrma",
  "Thinking.vrma",
  "VRMA_01.vrma",
  "VRMA_02.vrma",
  "VRMA_03.vrma",
  "VRMA_04.vrma",
  "VRMA_05.vrma",
  "VRMA_06.vrma",
  "VRMA_07.vrma",
].sort();

export function MotionVRMAList() {
  const { viewer } = useContext(ViewerContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredAnimations = VRMA_ANIMATIONS.filter((anim) =>
    anim.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAnimationClick = async (filename: string) => {
    if (!viewer.model) {
      console.warn("VRM model not loaded yet");
      return;
    }

    try {
      const animationPath = `/assets/vrm/animation/vrma/${filename}`;
      viewer.loadVRMA(animationPath);
      console.log(`Playing animation: ${filename}`);
    } catch (error) {
      console.error(`Failed to play animation ${filename}:`, error);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-20 bg-base border-2 border-primary rounded-8 shadow-lg max-w-xs w-80" style={{ marginTop: '60px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-12 py-8 text-left font-bold text-text-primary hover:bg-surface1-hover rounded-t-8 flex items-center justify-between"
      >
        <span>VRMA List ({VRMA_ANIMATIONS.length})</span>
        <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
      </button>
      
      {isOpen && (
        <div className="border-t border-primary flex flex-col" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <div className="p-8 pb-4">
            <input
              type="text"
              placeholder="Search animations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-8 py-4 bg-surface1 hover:bg-surface1-hover rounded-4 text-text-primary typography-14 font-M_PLUS_2"
            />
          </div>
          <div className="px-8 pb-8 flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
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
                    {filename.replace(".vrma", "")}
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


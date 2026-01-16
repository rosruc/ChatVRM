import { useContext, useState, useEffect } from "react";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import * as THREE from "three";

export function ShapeKeyList() {
  const { viewer } = useContext(ViewerContext);
  const [shapeKeys, setShapeKeys] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [shapeKeyValues, setShapeKeyValues] = useState<{
    [key: string]: number;
  }>({});
  const [morphTargetMap, setMorphTargetMap] = useState<
    Map<string, Array<{ mesh: THREE.SkinnedMesh; index: number }>>
  >(new Map());

  // Update shape keys when VRM model is loaded
  useEffect(() => {
    if (viewer.model?.vrm?.scene) {
      const keySet = new Set<string>();
      const morphMap = new Map<
        string,
        Array<{ mesh: THREE.SkinnedMesh; index: number }>
      >();
      const vrm = viewer.model.vrm;

      // Try VRM 1.1 approach first (blendShapeProxy)
      if ((vrm as any).blendShapeProxy) {
        const blendShapeProxy = (vrm as any).blendShapeProxy;
        const blendShapeGroups = blendShapeProxy.blendShapeGroups || [];

        blendShapeGroups.forEach((group: any) => {
          if (group.name) {
            keySet.add(group.name);

            // For VRM 1.1, we need to find the corresponding mesh and index
            // The blendShapeProxy manages the actual application
            // We'll store a reference to the blendShapeProxy for later use
            if (!morphMap.has(group.name)) {
              morphMap.set(group.name, []);
            }
            // Store a special marker for VRM 1.1 blend shapes
            morphMap.get(group.name)!.push({
              mesh: null as any,
              index: -1,
              blendShapeGroup: group,
              isVRM1: true,
            } as any);
          }
        });
      }

      // Also try accessing blend shapes through expression manager (VRM 1.1)
      // Expressions in VRM are combinations of blend shapes, and the expression manager
      // might have references to individual blend shapes
      if (
        vrm.expressionManager &&
        (vrm.expressionManager as any).blendShapeProxy
      ) {
        const exprBlendShapeProxy = (vrm.expressionManager as any)
          .blendShapeProxy;
        const exprBlendShapeGroups =
          exprBlendShapeProxy?.blendShapeGroups || [];

        exprBlendShapeGroups.forEach((group: any) => {
          if (group.name && !keySet.has(group.name)) {
            keySet.add(group.name);

            if (!morphMap.has(group.name)) {
              morphMap.set(group.name, []);
            }
            morphMap.get(group.name)!.push({
              mesh: null as any,
              index: -1,
              blendShapeGroup: group,
              isVRM1: true,
              fromExpressionManager: true,
            } as any);
          }
        });
      }

      // Also try VRM 0.x approach (geometry morph targets)
      // This will work for VRM 0.x and may also find additional morph targets in VRM 1.1
      viewer.model.vrm.scene.traverse((object) => {
        if ((object as any).isMesh) {
          const mesh = object as THREE.SkinnedMesh;
          const geometry = mesh.geometry;

          // Check if geometry has morph targets
          if (geometry.morphAttributes?.position) {
            const morphTargets = geometry.morphAttributes.position;

            // Try multiple methods to get morph target names
            let targetNames: string[] | undefined;

            // Method 1: VRM 0.x stores names in userData.targetNames
            if (geometry.userData?.targetNames) {
              targetNames = geometry.userData.targetNames as string[];
            }
            // Method 2: Check morphTargetDictionary (standard Three.js)
            else if ((geometry as any).morphTargetDictionary) {
              targetNames = Object.keys(
                (geometry as any).morphTargetDictionary
              );
            }
            // Method 3: Check if morph targets have names
            else if (morphTargets.length > 0) {
              targetNames = morphTargets.map((target, index: number) => {
                const bufferAttr = target as THREE.BufferAttribute;
                return bufferAttr.name || `morphTarget_${index}`;
              });
            }

            if (targetNames && targetNames.length > 0) {
              // Ensure morphTargetInfluences is initialized
              if (!mesh.morphTargetInfluences) {
                mesh.morphTargetInfluences = new Array(
                  morphTargets.length
                ).fill(0);
              }

              targetNames.forEach((name: string, index: number) => {
                // Only add if not already added from VRM 1.1 blendShapeProxy
                if (!keySet.has(name)) {
                  keySet.add(name);
                }

                if (!morphMap.has(name)) {
                  morphMap.set(name, []);
                }
                // Add the mesh reference for VRM 0.x morph targets
                const existing = morphMap.get(name)!;
                // Check if this is a VRM 1.1 entry (has isVRM1 flag)
                const vrm1Entry = existing.find((e: any) => e.isVRM1);
                if (!vrm1Entry) {
                  // Add mesh-based entry (VRM 0.x or additional morph targets)
                  existing.push({ mesh, index });
                }
              });
            }
          }
        }
      });

      const sortedKeys = Array.from(keySet).sort();

      console.log("Found shape keys:", sortedKeys);
      console.log("Morph target map:", morphMap);
      console.log("VRM version info:", {
        hasBlendShapeProxy: !!(vrm as any).blendShapeProxy,
        hasExpressionManager: !!vrm.expressionManager,
        vrmObject: vrm,
      });

      setShapeKeys(sortedKeys);
      setMorphTargetMap(morphMap);

      // Initialize shape key values from current morph target influences
      const initialValues: { [key: string]: number } = {};
      sortedKeys.forEach((key) => {
        const targets = morphMap.get(key);
        if (targets && targets.length > 0) {
          const firstTarget = targets[0];

          // Check if this is a VRM 1.1 blend shape
          if (
            (firstTarget as any).isVRM1 &&
            (firstTarget as any).blendShapeGroup
          ) {
            // For VRM 1.1, get value from blendShapeProxy
            const group = (firstTarget as any).blendShapeGroup;
            const fromExpressionManager = (firstTarget as any)
              .fromExpressionManager;

            // Try expression manager's blendShapeProxy first if it came from there
            let blendShapeProxy =
              fromExpressionManager && vrm.expressionManager
                ? (vrm.expressionManager as any).blendShapeProxy
                : (vrm as any).blendShapeProxy;

            // Fallback to VRM's blendShapeProxy if expression manager doesn't have it
            if (!blendShapeProxy) {
              blendShapeProxy = (vrm as any).blendShapeProxy;
            }

            if (blendShapeProxy) {
              // Try to get current weight from the blendShapeProxy
              initialValues[key] =
                group.weight !== undefined ? group.weight : 0;
            } else {
              initialValues[key] = 0;
            }
          } else {
            // For VRM 0.x, get value from morphTargetInfluences
            initialValues[key] =
              firstTarget.mesh.morphTargetInfluences?.[firstTarget.index] ?? 0;
          }
        } else {
          initialValues[key] = 0;
        }
      });
      setShapeKeyValues(initialValues);
    } else {
      setShapeKeys([]);
      setMorphTargetMap(new Map());
      setShapeKeyValues({});
    }
  }, [viewer.model?.vrm]);

  const filteredShapeKeys = shapeKeys.filter((key) =>
    key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleShapeKeyValueChange = (key: string, value: number) => {
    const targets = morphTargetMap.get(key);
    if (!targets || targets.length === 0) {
      console.warn(`Shape key ${key} not found in morph target map`);
      return;
    }

    try {
      const vrm = viewer.model?.vrm;
      if (!vrm) return;

      const firstTarget = targets[0];

      // Check if this is a VRM 1.1 blend shape
      if ((firstTarget as any).isVRM1 && (firstTarget as any).blendShapeGroup) {
        // For VRM 1.1, use blendShapeProxy to set the value
        const group = (firstTarget as any).blendShapeGroup;
        const fromExpressionManager = (firstTarget as any)
          .fromExpressionManager;

        // Try expression manager's blendShapeProxy first if it came from there
        let blendShapeProxy =
          fromExpressionManager && vrm.expressionManager
            ? (vrm.expressionManager as any).blendShapeProxy
            : (vrm as any).blendShapeProxy;

        // Fallback to VRM's blendShapeProxy if expression manager doesn't have it
        if (!blendShapeProxy) {
          blendShapeProxy = (vrm as any).blendShapeProxy;
        }

        if (blendShapeProxy) {
          // Set the weight on the blend shape group
          if (blendShapeProxy.setValue) {
            blendShapeProxy.setValue(group.name, value);
          } else if (group.weight !== undefined) {
            group.weight = value;
            // Update the blendShapeProxy
            if (blendShapeProxy.update) {
              blendShapeProxy.update();
            }
          }
        }
      } else {
        // For VRM 0.x, update mesh morph target influences directly
        targets.forEach(({ mesh, index }) => {
          if (
            mesh &&
            mesh.morphTargetInfluences &&
            index >= 0 &&
            index < mesh.morphTargetInfluences.length
          ) {
            mesh.morphTargetInfluences[index] = value;
          }
        });
      }

      // Update expression manager to reflect the changes
      if (vrm.expressionManager) {
        vrm.expressionManager.update();
      }

      // Update VRM to apply changes
      vrm.update(0);

      setShapeKeyValues((prev) => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error(`Failed to set shape key ${key}:`, error);
    }
  };

  const handleResetAll = () => {
    const vrm = viewer.model?.vrm;
    if (!vrm) return;

    shapeKeys.forEach((key) => {
      const targets = morphTargetMap.get(key);
      if (targets && targets.length > 0) {
        const firstTarget = targets[0];

        // Check if this is a VRM 1.1 blend shape
        if (
          (firstTarget as any).isVRM1 &&
          (firstTarget as any).blendShapeGroup
        ) {
          const group = (firstTarget as any).blendShapeGroup;
          const fromExpressionManager = (firstTarget as any)
            .fromExpressionManager;

          // Try expression manager's blendShapeProxy first if it came from there
          let blendShapeProxy =
            fromExpressionManager && vrm.expressionManager
              ? (vrm.expressionManager as any).blendShapeProxy
              : (vrm as any).blendShapeProxy;

          // Fallback to VRM's blendShapeProxy if expression manager doesn't have it
          if (!blendShapeProxy) {
            blendShapeProxy = (vrm as any).blendShapeProxy;
          }

          if (blendShapeProxy) {
            if (blendShapeProxy.setValue) {
              blendShapeProxy.setValue(group.name, 0);
            } else if (group.weight !== undefined) {
              group.weight = 0;
            }
          }
        } else {
          // For VRM 0.x, reset mesh morph target influences
          targets.forEach(({ mesh, index }) => {
            if (
              mesh &&
              mesh.morphTargetInfluences &&
              index >= 0 &&
              index < mesh.morphTargetInfluences.length
            ) {
              mesh.morphTargetInfluences[index] = 0;
            }
          });
        }
      }
    });

    // Update expression manager after resetting all values
    if (vrm.expressionManager) {
      vrm.expressionManager.update();
    }

    // Update VRM to apply changes
    vrm.update(0);

    const resetValues: { [key: string]: number } = {};
    shapeKeys.forEach((key) => {
      resetValues[key] = 0;
    });
    setShapeKeyValues(resetValues);
  };

  return (
    <div
      className="fixed right-4 z-20 bg-base border-2 border-primary rounded-8 shadow-lg max-w-xs w-80"
      style={{ marginTop: shapeKeys.length > 0 ? "120px" : "60px" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-12 py-8 text-left font-bold text-text-primary hover:bg-surface1-hover rounded-t-8 flex items-center justify-between"
      >
        <span>Shape Keys ({shapeKeys.length})</span>
        <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
      </button>

      {isOpen && (
        <div
          className="border-t border-primary flex flex-col"
          style={{ maxHeight: "calc(100vh - 400px)" }}
        >
          {shapeKeys.length === 0 ? (
            <div className="p-8 text-text-secondary text-center typography-14">
              {viewer.model?.vrm
                ? "No shape keys found"
                : "Load a VRM model first"}
            </div>
          ) : (
            <>
              <div className="p-8 pb-4 flex gap-2">
                <input
                  type="text"
                  placeholder="Search shape keys..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-8 py-4 bg-surface1 hover:bg-surface1-hover rounded-4 text-text-primary typography-14 font-M_PLUS_2"
                />
                <button
                  onClick={handleResetAll}
                  className="px-8 py-4 bg-secondary hover:bg-secondary-hover active:bg-secondary-press rounded-4 text-text-primary typography-12 font-M_PLUS_2 font-bold"
                  title="Reset all shape keys to 0"
                >
                  Reset
                </button>
              </div>
              <div
                className="px-8 pb-8 flex-1 overflow-y-auto"
                style={{ minHeight: 0 }}
              >
                {filteredShapeKeys.length === 0 ? (
                  <div className="text-text-secondary text-center py-8 typography-14">
                    No shape keys found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredShapeKeys.map((key) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-text-primary typography-12 font-M_PLUS_2 font-semibold">
                            {key}
                          </span>
                          <span className="text-text-secondary typography-10 font-M_PLUS_2">
                            {((shapeKeyValues[key] ?? 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={shapeKeyValues[key] ?? 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            handleShapeKeyValueChange(key, value);
                          }}
                          className="w-full h-2 bg-surface1 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useContext, useState, useEffect } from "react";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";

export function ExpressionList() {
  const { viewer } = useContext(ViewerContext);
  const [expressions, setExpressions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [expressionValues, setExpressionValues] = useState<{
    [key: string]: number;
  }>({});

  // Update expressions when VRM model is loaded
  useEffect(() => {
    if (viewer.model?.vrm?.expressionManager) {
      const manager = viewer.model.vrm.expressionManager;

      // Get all available expression names
      const expressionNames = Object.keys(manager.expressionMap || {});

      console.log("Found expressions:", expressionNames);
      console.log("Expression manager:", manager);

      const sortedExpressions = expressionNames.sort();
      setExpressions(sortedExpressions);

      // Initialize expression values
      const initialValues: { [key: string]: number } = {};
      sortedExpressions.forEach((name) => {
        initialValues[name] = manager.getValue(name) || 0;
      });
      setExpressionValues(initialValues);
    } else {
      setExpressions([]);
      setExpressionValues({});
    }
  }, [viewer.model?.vrm]);

  const filteredExpressions = expressions.filter((key) =>
    key.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleExpressionValueChange = (name: string, value: number) => {
    const manager = viewer.model?.vrm?.expressionManager;
    if (!manager) {
      console.warn("Expression manager not found");
      return;
    }

    try {
      // Set the expression value
      manager.setValue(name, value);

      // Update the expression manager
      manager.update();

      setExpressionValues((prev) => ({ ...prev, [name]: value }));
    } catch (error) {
      console.error(`Failed to set expression ${name}:`, error);
    }
  };

  const handleResetAll = () => {
    const manager = viewer.model?.vrm?.expressionManager;
    if (!manager) return;

    expressions.forEach((name) => {
      try {
        manager.setValue(name, 0);
      } catch (error) {
        console.error(`Failed to reset expression ${name}:`, error);
      }
    });

    manager.update();

    const resetValues: { [key: string]: number } = {};
    expressions.forEach((name) => {
      resetValues[name] = 0;
    });
    setExpressionValues(resetValues);
  };

  const handlePlayExpression = (name: string) => {
    const manager = viewer.model?.vrm?.expressionManager;
    if (!manager) return;

    // ExpressionList is for debugging arbitrary model expression keys,
    try {
      manager.setValue(name as any, 1);
      manager.update();
      setTimeout(() => {
        try {
          manager.setValue(name as any, 0);
          manager.update();
        } catch {
          // ignore
        }
      }, 800);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed top-4 left-4 z-20 bg-base border-2 border-primary rounded-8 shadow-lg max-w-xs w-80"
      style={{ marginTop: expressions.length > 0 ? "120px" : "60px" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-12 py-8 text-left font-bold text-text-primary hover:bg-surface1-hover rounded-t-8 flex items-center justify-between"
      >
        <span>Expressions ({expressions.length})</span>
        <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
      </button>

      {isOpen && (
        <div
          className="border-t border-primary flex flex-col"
          style={{ maxHeight: "calc(100vh - 400px)" }}
        >
          {expressions.length === 0 ? (
            <div className="p-8 text-text-secondary text-center typography-14">
              {viewer.model?.vrm
                ? "No expressions found"
                : "Load a VRM model first"}
            </div>
          ) : (
            <>
              <div className="p-8 pb-4 flex gap-2">
                <input
                  type="text"
                  placeholder="Search expressions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-8 py-4 bg-surface1 hover:bg-surface1-hover rounded-4 text-text-primary typography-14 font-M_PLUS_2"
                />
                <button
                  onClick={handleResetAll}
                  className="px-8 py-4 bg-secondary hover:bg-secondary-hover active:bg-secondary-press rounded-4 text-text-primary typography-12 font-M_PLUS_2 font-bold"
                  title="Reset all expressions to 0"
                >
                  Reset
                </button>
              </div>
              <div
                className="px-8 pb-8 flex-1 overflow-y-auto"
                style={{ minHeight: 0 }}
              >
                {filteredExpressions.length === 0 ? (
                  <div className="text-text-secondary text-center py-8 typography-14">
                    No expressions found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredExpressions.map((name) => (
                      <div key={name} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-text-primary typography-12 font-M_PLUS_2 font-semibold truncate">
                              {name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePlayExpression(name)}
                              className="px-6 py-2 bg-surface1 hover:bg-surface1-hover active:bg-surface2 rounded-4 text-text-primary typography-10 font-M_PLUS_2 font-bold whitespace-nowrap"
                              title="Play a 0→1→0 sine-wave pulse"
                              disabled={!viewer.model?.emoteController}
                            >
                              Play
                            </button>
                          </div>
                          <span className="text-text-secondary typography-10 font-M_PLUS_2 whitespace-nowrap">
                            {((expressionValues[name] ?? 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={expressionValues[name] ?? 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            handleExpressionValueChange(name, value);
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

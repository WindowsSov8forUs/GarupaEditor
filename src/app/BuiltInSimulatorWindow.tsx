import { useEffect, useRef } from "react";
import { SimulatorAppController } from "../simulator/app/SimulatorAppController";
import { isMobileRuntime, navigateBackToEditor } from "./mobileRuntime";
import "../App.css";
import "../simulator/styles/simulator.css";

function BuiltInSimulatorWindow() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const controller = new SimulatorAppController(host);
    return () => {
      controller.dispose();
    };
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {isMobileRuntime() ? (
        <button
          type="button"
          className="simulator-mobile-back-button"
          onClick={navigateBackToEditor}
          title="返回编辑器"
          aria-label="返回编辑器"
        >
          返回
        </button>
      ) : null}
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
    </main>
  );
}

export default BuiltInSimulatorWindow;

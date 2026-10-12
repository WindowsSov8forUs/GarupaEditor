import ReactDOM from "react-dom/client";
import { UiViewportRoot } from "./components/UiViewport";
import StartupShell from "./app/StartupShell";
import { initializeLogging } from "./logging/applicationLogger";
import "./App.css";

const auxiliary = window.location.hash.startsWith("#static-render") || window.location.hash.startsWith("#simulator");
if (auxiliary) {
  void import("./auxiliaryBootstrap");
} else {
  initializeLogging();
  ReactDOM.createRoot(document.getElementById("root")!).render(<UiViewportRoot><StartupShell /></UiViewportRoot>);
}

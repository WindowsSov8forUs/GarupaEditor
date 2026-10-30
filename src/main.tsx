import ReactDOM from "react-dom/client";
import { UiViewportRoot } from "./components/UiViewport";
import StartupShell from "./app/StartupShell";
import { initializeLogging } from "./logging/applicationLogger";
import "./App.css";

// Windows hosts treat a released lone Alt as menu activation (SC_KEYMENU): the WebView keeps
// rendering but stops receiving input until the window is clicked. No page uses Alt itself.
for (const type of ["keydown", "keyup"] as const) {
  window.addEventListener(type, event => { if (event.key === "Alt") event.preventDefault(); }, true);
}

const auxiliary = window.location.hash.startsWith("#static-render") || window.location.hash.startsWith("#simulator");
if (auxiliary) {
  void import("./auxiliaryBootstrap");
} else {
  initializeLogging();
  ReactDOM.createRoot(document.getElementById("root")!).render(<UiViewportRoot><StartupShell /></UiViewportRoot>);
}

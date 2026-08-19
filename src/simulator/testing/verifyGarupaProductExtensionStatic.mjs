import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), "src/simulator", path), "utf8");
const profile = read("engine/garupa/productChartProfile.ts");
const axis = read("engine/garupa/timingGroupAxis.ts");
const timeline = read("engine/garupa/productTimelineManager.ts");
const render = read("engine/garupa/productRenderProducer.ts");
const scene = read("scene/simulatorSceneLayout.ts");
const recipe = read("assembly/sessionRecipe.ts");
const contracts = read("public/contracts.ts");
const composition = read("platform/platformComposition.ts");
const capabilities = read("public/capabilities.ts");
const chartContract = read("assembly/garupaChartContract.ts");

for (const [source, symbols] of [
  [profile, ["product-extension", "ButtonType.None", "visibleNodes", "allHidden", "containsHidden"]],
  [axis, ["owner === \"group\" ? 0 : 1", "speed = nextSpeed", "findVisibilityWindows", "displacementAtPosition"]],
  [timeline, ["garupa-visible-node", "screenToContinuousLane", "isInsideContinuousSpan", "pendingGesture", "missedNodeCount"]],
  [render, ["garupa-product-front", "garupa-product-slide-line", "garupa-product-particle", "set-mesh"]],
  [scene, ["for (let lane = 0; lane < 7; lane += 1)", "projectLaneAtCurve", "screenToContinuousLane"]],
  [recipe, ["readonly schemaVersion: 10", '"bgm,chart,isFullLength"']],
  [contracts, ["readonly chart: GarupaChartJson", "readonly isFullLength: boolean"]],
  [composition, ["constructChartFromGarupaChartJson", "garupaProductScene", "chartFidelity"]],
  [capabilities, ["garupaSvTimingGroup", "garupaContinuousLaneOutside", "garupaExtendedSlideGraph", "garupaExtendedManualInput", "closed-product-extension"]],
]) for (const symbol of symbols) if (!source.includes(symbol)) throw new Error(`Garupa product static owner missing ${symbol}`);

if (chartContract.includes("complete-product-contract-open") || chartContract.includes("describeOpenGarupaProductExtension")) {
  throw new Error("temporary Garupa product gate remains after closure");
}

for (const [source, forbidden] of [
  [profile, ["Math.random", "Date.now", "performance.now", "laneDomain", "laneCount", "minimumLane", "maximumLane"]],
  [axis, ["Math.random", "Date.now", "performance.now"]],
  [timeline, ["Math.random", "Date.now", "performance.now", "src/app", "Button_07_BMS_1P_07"]],
  [render, ["Math.random", "Date.now", "performance.now", "Math.round(node.lane)", "Math.min(7", "laneDomain"]],
  [scene, ["SimulatorProductLaneCount", "minimumLane", "maximumLane"]],
  [recipe, ["chartData.laneCount"]],
  [contracts, ["SimulatorProductLaneCount", "readonly laneCount"]],
  [composition, ["chartData.laneCount"]],
]) for (const symbol of forbidden) if (source.includes(symbol)) throw new Error(`Garupa product forbidden fallback/ambient dependency remains: ${symbol}`);

console.log("Garupa product extension static boundary verified: schema10/fixed-seven-field/profile/axis/continuous scene/Auto/Manual/render/particle/lifecycle");

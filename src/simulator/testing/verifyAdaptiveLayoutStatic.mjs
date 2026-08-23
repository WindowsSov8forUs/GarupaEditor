import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const simulatorRoot = resolve(process.cwd(), "src", "simulator");
const production = walk(simulatorRoot).filter((path) =>
  !path.includes(`${join("src", "simulator", "testing")}`) &&
  !path.includes(`${join("src", "simulator", "audit")}`) &&
  path.endsWith(".ts")
);
const fixedViewport = /(?<![A-Za-z0-9_])(?:1600|720)(?![A-Za-z0-9_])/;
for (const path of production) {
  const source = readFileSync(path, "utf8");
  if (fixedViewport.test(source)) {
    throw new Error(`fixed delivery-frame scalar remains in production: ${relative(simulatorRoot, path)}`);
  }
  for (const forbidden of [
    "REHEARSAL_CONTROL_SCENE_PROFILE",
    "rehearsal_control_rendering_profile",
    "STARTUP_STAGE_SIZE",
    'inputOrigin: "bottom-left"',
    "viewportCenter:",
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(`forbidden fixed/screenshot layout symbol ${forbidden} in ${relative(simulatorRoot, path)}`);
    }
  }
}

const publicContract = read("public/contracts.ts");
const recipe = read("assembly/sessionRecipe.ts");
if (publicContract.includes("highAspectRatio") || recipe.includes("config.visual.highAspectRatio")) {
  throw new Error("caller-authored HighAspectRatio remains in Public/recipe boundary");
}
for (const required of [
  "readonly schemaVersion: 12",
  '"habahiroMeshWidthSetting,noteSize,specificSpeed"',
]) if (!recipe.includes(required)) throw new Error(`Schema 12 adaptive boundary missing ${required}`);

const surface = read("platform/surfaceContracts.ts");
for (const required of [
  "SimulatorSurfaceState",
  "copyAndValidateInitialSimulatorSurface",
  "validateUnchangedSimulatorSurface",
  "GE-PS-SURFACE-ATOMIC-REBUILD",
]) if (!surface.includes(required)) throw new Error(`surface contract missing ${required}`);
const composition = read("platform/platformComposition.ts");
const replay = read("host/portableReplaySession.ts");
for (const required of ['purpose === "surface-rebuild"', "readSurface: () => readPlatformSurface", "rebuildSurface()"]) {
  if (!composition.includes(required) && !replay.includes(required)) {
    throw new Error(`product surface rebuild missing ${required}`);
  }
}
const layout = read("scene/originalSurfaceLayout.ts");
for (const required of [
  "ORIGINAL_ASPECT_RATIO_BASE",
  "ORIGINAL_ANDROID_FULL_SAFE_RATIO",
  "screenToSafeAreaRatio",
  "pixelsPerWorldUnit",
  "timeBackgroundBoundsTopLeft",
  "autoLiveCaptionBoundsTopLeft",
]) if (!layout.includes(required)) throw new Error(`original layout owner missing ${required}`);
const rehearsal = read("scene/rehearsalControlScene.ts");
for (const required of ["insideCircle", "hitCircleRadiusPixels", "surfaceRevision"]) {
  if (!rehearsal.includes(required)) throw new Error(`Rehearsal original owner missing ${required}`);
}
const renderer = read("backends/pixi/pixiRendererBackend.ts");
for (const required of ["bindOriginalSurfaceLayout", "placeSafeTopAnchoredUiRoot", "screenToSafeChildScale"]) {
  if (!renderer.includes(required)) throw new Error(`renderer layout binding missing ${required}`);
}
const startup = read("backends/pixi/pixiStartupDirectionScene.ts");
if (!startup.includes("surfaceLayout.ui.screenToSafeChildScale") || !startup.includes("viewportWidth")) {
  throw new Error("startup scene does not consume original surface layout");
}
const movie = read("backends/pixi/pixiMvLiveBackend.ts");
if (!movie.includes("OriginalMovieLayout") || !movie.includes("this.movieLayout.width")) {
  throw new Error("MV scene does not consume original movie widget layout");
}

const fixture = JSON.parse(readFileSync(join(
  simulatorRoot,
  "testing/fixtures/reverse-snapshots/adaptive-layout/artifacts/investigations/simulator-multiaspect-layout-runtime-contract-10-1-4/simulator_multiaspect_layout_contract.json",
), "utf8"));
for (const key of [
  "screenshot_derived_production_scalar_count",
  "fixed_device_frame_as_layout_authority_count",
  "unclassified_layout_scalar_count",
  "unknown_formula_or_order_count",
]) if (fixture.provenance[key] !== 0) throw new Error(`Reverse provenance not closed: ${key}`);
if (fixture.closure.production_authorization.initial_adaptive_landscape !== true ||
    fixture.closure.production_authorization.dynamic_resize !== false) {
  throw new Error("Reverse adaptive/dynamic authorization mismatch");
}
console.log(`adaptive layout static boundary verified: production-ts=${production.length} fixed-frame=0 screenshot-authority=0 original-dynamic=false product-rebuild=true`);

function read(relativePath) {
  return readFileSync(join(simulatorRoot, relativePath), "utf8");
}
function walk(directory) {
  const values = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) values.push(...walk(path));
    else values.push(path);
  }
  return values;
}

import comboNumberUrl from "../../assets/game/atlas/bms/ui/iconcombonumber/combo-number.png?url&no-inline";
import rhythmGameAdditiveUrl from "../../assets/game/atlas/bms/ui/rhythmgameui/rhythm-game-additive.png?url&no-inline";
import rhythmGameUiUrl from "../../assets/game/atlas/bms/ui/rhythmgameui/rhythm-game-ui.png?url&no-inline";
import tapLaneEffect1Url from "../../assets/game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-1.png?url&no-inline";
import tapLaneEffect2Url from "../../assets/game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-2.png?url&no-inline";
import tapLaneEffect3Url from "../../assets/game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-3.png?url&no-inline";
import tapLaneEffect4Url from "../../assets/game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-4.png?url&no-inline";
import uiAdditiveEffectUrl from "../../assets/game/atlas/bms/ui/ui-additive-effect/ui-additive-effect.png?url&no-inline";
import uiCommonUrl from "../../assets/game/atlas/bms/ui/uicommon/ui-common.png?url&no-inline";
import scoreFontUrl from "../../assets/game/fonts/score/score/score-font.png?url&no-inline";
import rankLabelFontUrl from "../../assets/game/fonts/sgm/rank-label-font.ttf?url&no-inline";
import ordinaryRenderProfileUrl from "../../assets/game/portable/profiles/ordinary-render/profile.json?url&no-inline";
import ordinaryVisibleProfileUrl from "../../assets/game/portable/profiles/ordinary-visible/profile.json?url&no-inline";
import startupLineStarUrl from "../../assets/game/prefabs/bms/information/startup-line-star.png?url&no-inline";
import countdown1Url from "../../assets/game/prefabs/bms/pause/countdown-1.png?url&no-inline";
import countdown2Url from "../../assets/game/prefabs/bms/pause/countdown-2.png?url&no-inline";
import countdown3Url from "../../assets/game/prefabs/bms/pause/countdown-3.png?url&no-inline";
import highRankKiraUrl from "../../assets/game/prefabs/bms/rhythmgamegauge/score/high-rank-kira.png?url&no-inline";
import highRankLongStarUrl from "../../assets/game/prefabs/bms/rhythmgamegauge/score/high-rank-long-star.png?url&no-inline";
import highRankOverlayUrl from "../../assets/game/prefabs/bms/rhythmgamegauge/score/high-rank-overlay.png?url&no-inline";
import scoreGaugeSsAnimationProfileUrl from "../../assets/game/prefabs/bms/rhythmgamegauge/score/score-gauge-ss-animation-profile.json?url&no-inline";
import manifestJson from "./simulatorBuiltinResourceManifest.json";
import type { ApplicationResourceManager } from "../applicationResourceManager";
import {
  createResourceRef,
  resourceAccepted,
  resourceRejected,
  type ResourceRef,
  type ResourceResult,
} from "../contracts";

interface SimulatorBuiltinManifestEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly sourceReverseCommit: string;
  readonly sourcePath: string;
}

interface SimulatorBuiltinFileDefinition {
  readonly assetPath: string;
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly url: string;
}

interface SimulatorBuiltinResourceDefinition {
  readonly logicalResource: string;
  readonly title: string;
  readonly kind: "image" | "font" | "json" | "package";
  readonly files: readonly SimulatorBuiltinFileDefinition[];
}

const DEFINITIONS: readonly SimulatorBuiltinResourceDefinition[] = Object.freeze([
  resource("atlas/bms/ui/iconcombonumber", "Combo number atlas", "image", [
    file("game/atlas/bms/ui/iconcombonumber/combo-number.png", "combo-number.png", "image/png", comboNumberUrl),
  ]),
  resource("atlas/bms/ui/rhythmgameui", "Rhythm game UI atlases", "package", [
    file("game/atlas/bms/ui/rhythmgameui/rhythm-game-additive.png", "rhythm-game-additive.png", "image/png", rhythmGameAdditiveUrl),
    file("game/atlas/bms/ui/rhythmgameui/rhythm-game-ui.png", "rhythm-game-ui.png", "image/png", rhythmGameUiUrl),
  ]),
  resource("atlas/bms/ui/tap-lane-effect", "Tap lane effect textures", "package", [
    file("game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-1.png", "tap-lane-effect-1.png", "image/png", tapLaneEffect1Url),
    file("game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-2.png", "tap-lane-effect-2.png", "image/png", tapLaneEffect2Url),
    file("game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-3.png", "tap-lane-effect-3.png", "image/png", tapLaneEffect3Url),
    file("game/atlas/bms/ui/tap-lane-effect/tap-lane-effect-4.png", "tap-lane-effect-4.png", "image/png", tapLaneEffect4Url),
  ]),
  resource("atlas/bms/ui/ui-additive-effect", "UI additive effect atlas", "image", [
    file("game/atlas/bms/ui/ui-additive-effect/ui-additive-effect.png", "ui-additive-effect.png", "image/png", uiAdditiveEffectUrl),
  ]),
  resource("atlas/bms/ui/uicommon", "UI common atlas", "image", [
    file("game/atlas/bms/ui/uicommon/ui-common.png", "ui-common.png", "image/png", uiCommonUrl),
  ]),
  resource("fonts/score/score", "Score bitmap font atlas", "image", [
    file("game/fonts/score/score/score-font.png", "score-font.png", "image/png", scoreFontUrl),
  ]),
  resource("fonts/sgm", "Rank label font", "font", [
    file("game/fonts/sgm/rank-label-font.ttf", "rank-label-font.ttf", "font/ttf", rankLabelFontUrl),
  ]),
  resource("portable/profiles/ordinary-render", "Ordinary render semantic profile", "json", [
    file("game/portable/profiles/ordinary-render/profile.json", "profile.json", "application/json", ordinaryRenderProfileUrl),
  ]),
  resource("portable/profiles/ordinary-visible", "Ordinary visible semantic profile", "json", [
    file("game/portable/profiles/ordinary-visible/profile.json", "profile.json", "application/json", ordinaryVisibleProfileUrl),
  ]),
  resource("prefabs/bms/information", "Startup information resources", "image", [
    file("game/prefabs/bms/information/startup-line-star.png", "startup-line-star.png", "image/png", startupLineStarUrl),
  ]),
  resource("prefabs/bms/pause", "In-game Pause countdown resources", "package", [
    file("game/prefabs/bms/pause/countdown-1.png", "countdown-1.png", "image/png", countdown1Url),
    file("game/prefabs/bms/pause/countdown-2.png", "countdown-2.png", "image/png", countdown2Url),
    file("game/prefabs/bms/pause/countdown-3.png", "countdown-3.png", "image/png", countdown3Url),
  ]),
  resource("prefabs/bms/rhythmgamegauge/score", "Score gauge portable resources", "package", [
    file("game/prefabs/bms/rhythmgamegauge/score/high-rank-kira.png", "high-rank-kira.png", "image/png", highRankKiraUrl),
    file("game/prefabs/bms/rhythmgamegauge/score/high-rank-long-star.png", "high-rank-long-star.png", "image/png", highRankLongStarUrl),
    file("game/prefabs/bms/rhythmgamegauge/score/high-rank-overlay.png", "high-rank-overlay.png", "image/png", highRankOverlayUrl),
    file("game/prefabs/bms/rhythmgamegauge/score/score-gauge-ss-animation-profile.json", "score-gauge-ss-animation-profile.json", "application/json", scoreGaugeSsAnimationProfileUrl),
  ]),
]);

const MANIFEST = new Map(
  (manifestJson.entries as readonly SimulatorBuiltinManifestEntry[]).map((entry) => [entry.path, entry]),
);
const REFS = new Map<string, ResourceRef>();

export async function registerSimulatorBuiltinResources(
  manager: ApplicationResourceManager,
): Promise<ResourceResult<void>> {
  for (const definition of DEFINITIONS) {
    const registered = await manager.registerBuiltin({
      id: `builtin/game/${definition.logicalResource}`,
      kind: definition.kind,
      title: definition.title,
      sourceUrl: definition.files[0]!.url,
      logicalPlacement: Object.freeze({
        provider: "application",
        server: null,
        canonicalPath: `game/${definition.logicalResource}`,
        identityClass: "application-builtin" as const,
      }),
      files: definition.files.map((definedFile) => {
        const manifest = MANIFEST.get(definedFile.assetPath);
        if (manifest === undefined) throw new Error(`Simulator builtin manifest is missing ${definedFile.assetPath}`);
        return Object.freeze({
          logicalPath: definedFile.logicalPath,
          mediaType: definedFile.mediaType,
          integrity: Object.freeze({ byteLength: manifest.byteLength, sha256: manifest.sha256 }),
          loadBytes: () => fetchBuiltinBytes(definedFile.url),
        });
      }),
    });
    if (registered.status === "rejected") return registered;
    REFS.set(definition.logicalResource, registered.value.ref);
  }
  return resourceAccepted(undefined);
}

export function simulatorBuiltinResourceRef(logicalResource: string): ResourceResult<ResourceRef> {
  const existing = REFS.get(logicalResource);
  if (existing !== undefined) return resourceAccepted(existing);
  const reference = createResourceRef(`builtin/game/${logicalResource}`);
  return reference.status === "rejected"
    ? reference
    : resourceRejected(
        "resource-unavailable",
        "resources.builtin.simulator-logical-resource-unregistered",
        "The requested Simulator common logical resource was not registered by application bootstrap.",
      );
}

export function listSimulatorBuiltinDefinitionsForTesting(): readonly SimulatorBuiltinResourceDefinition[] {
  return DEFINITIONS;
}

function resource(
  logicalResource: string,
  title: string,
  kind: SimulatorBuiltinResourceDefinition["kind"],
  files: readonly SimulatorBuiltinFileDefinition[],
): SimulatorBuiltinResourceDefinition {
  return Object.freeze({ logicalResource, title, kind, files: Object.freeze(files) });
}

function file(
  assetPath: string,
  logicalPath: string,
  mediaType: string,
  url: string,
): SimulatorBuiltinFileDefinition {
  return Object.freeze({ assetPath, logicalPath, mediaType, url });
}

async function fetchBuiltinBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Simulator builtin fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Simulator builtin fetch returned empty bytes");
  return bytes;
}

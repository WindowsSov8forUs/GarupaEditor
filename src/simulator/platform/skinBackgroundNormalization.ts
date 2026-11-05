import { normalizeSourcePng } from "../../resources/normalizeImagePng";
import { assemblyAccepted, rejected, type SimulatorAssemblyResult } from "../assembly/result";
import type { PreparedSkinRenderOverlay } from "../assembly/skinRenderPreparation";

type SkinBackgroundImage = NonNullable<PreparedSkinRenderOverlay["backgroundImage"]>;

/**
 * Provider background-skin PNGs (liveBG and the stage-effect widget textures) are 8-bit
 * palette images; the original reads them as Unity textures. The session presentation takes
 * 8-bit RGBA, which the launch request already produces for the default stage, so the selected
 * background is decoded on the host and re-encoded the same way. Dimensions are not changed:
 * the presentation still checks them against the skin profile.
 */
export async function normalizeSkinBackgroundImage(
  image: SkinBackgroundImage | null,
): Promise<SimulatorAssemblyResult<SkinBackgroundImage | null>> {
  if (image === null) return assemblyAccepted(null);
  try {
    // Encoded concurrently: each PNG encode waits for idle time, about a second while busy.
    const [bytes, ...widgetBytes] = await Promise.all([
      normalizeSourcePng(image.bytes, "skin background", null),
      ...image.stageEffect.map((widget) => normalizeSourcePng(widget.bytes, "skin stage effect", null)),
    ]);
    const stageEffect = image.stageEffect.map((widget, index) => Object.freeze({ ...widget, bytes: widgetBytes[index]! }));
    return assemblyAccepted(Object.freeze({ ...image, bytes: bytes!, stageEffect: Object.freeze(stageEffect) }));
  } catch (error) {
    return rejected("resource-integrity", "simulator.presentation.skin-background-decode",
      `The selected background skin image could not be decoded on the host: ${error instanceof Error ? error.message : String(error)}`);
  }
}

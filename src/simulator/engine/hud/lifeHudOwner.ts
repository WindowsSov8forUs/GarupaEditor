import type { RenderFloat32, RenderLifeHudState } from "../../backends/renderingContracts";
import type { InGameRecordSnapshot } from "../managers/inGameRecord";

export class LifeHudOwner {
  createState(record: InGameRecordSnapshot): RenderLifeHudState {
    const ratio = Math.fround(record.currentLife / 1000);
    const primaryFill = Math.fround(Math.min(ratio, 1));
    const secondaryFill = Math.fround(Math.max(ratio - 1, 0));
    return Object.freeze({
      currentLife: record.currentLife,
      playerMaxLife: record.playerMaxLife,
      lifeUpperLimit: record.lifeUpperLimit,
      singleGameOver: record.singleGameOver,
      primaryFill: float32State(primaryFill),
      secondaryFill: float32State(secondaryFill),
      color: primaryFill <= Math.fround(0.2) ? "danger" as const : "normal" as const,
      warning: primaryFill <= Math.fround(0.25),
      label: `${record.currentLife}/${record.playerMaxLife}`,
    });
  }
}

function float32State(value: number): RenderFloat32 {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return Object.freeze({
    value: Math.fround(value),
    bits: view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0"),
  });
}

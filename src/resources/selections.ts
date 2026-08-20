import type { ResourceRef } from "./contracts";

export const APPLICATION_RESOURCE_SLOTS = Object.freeze([
  "ui.icon.apply-action",
  "ui.icon.back-arrow",
  "ui.icon.clear-action",
  "ui.icon.copy-action",
  "ui.icon.display",
  "ui.icon.edit",
  "ui.icon.image-export",
  "ui.icon.json-export",
  "ui.icon.json-import",
  "ui.icon.mirror-action",
  "ui.icon.options-title",
  "ui.icon.paste-action",
  "ui.icon.preview",
  "ui.icon.settings",
  "ui.icon.simulator-pause",
  "ui.icon.simulator-play",
  "ui.icon.skin",
  "ui.icon.undo-action",
  "ui.font.chart-ui-primary",
  "ui.font.chart-ui-fallback",
  "ui.default-cover",
  "ui.application-background",
  "skin.rhythm",
  "skin.directional",
  "skin.rhythm-se",
  "skin.directional-se",
  "skin.field",
  "skin.background",
  "skin.judge",
  "skin.common-se",
  "chart-media.bgm",
  "chart-media.cover",
  "chart-media.mv",
  "chart-media.stage-backdrop",
] as const);

export type ApplicationResourceSlot = (typeof APPLICATION_RESOURCE_SLOTS)[number];

export type ApplicationResourceSelection = Readonly<
  Record<ApplicationResourceSlot, ResourceRef | null>
>;

export interface ChartMediaResources {
  readonly bgm: ResourceRef | null;
  readonly cover: ResourceRef | null;
  readonly mv: ResourceRef | null;
  readonly stageBackdrop: ResourceRef | null;
}

export interface SkinResourceSelection {
  readonly rhythm: ResourceRef | null;
  readonly directional: ResourceRef | null;
  readonly rhythmSe: ResourceRef | null;
  readonly directionalSe: ResourceRef | null;
  readonly field: ResourceRef | null;
  readonly background: ResourceRef | null;
  readonly judge: ResourceRef | null;
  readonly commonSe: ResourceRef | null;
}

export function createEmptyApplicationResourceSelection(): ApplicationResourceSelection {
  return Object.freeze(Object.fromEntries(
    APPLICATION_RESOURCE_SLOTS.map((slot) => [slot, null]),
  )) as ApplicationResourceSelection;
}

export function replaceApplicationResourceSelection(
  current: ApplicationResourceSelection,
  changes: Readonly<Partial<Record<ApplicationResourceSlot, ResourceRef | null>>>,
): ApplicationResourceSelection {
  const next: Record<string, ResourceRef | null> = {};
  for (const slot of APPLICATION_RESOURCE_SLOTS) {
    next[slot] = Object.prototype.hasOwnProperty.call(changes, slot)
      ? changes[slot] ?? null
      : current[slot];
  }
  return Object.freeze(next) as ApplicationResourceSelection;
}

export function chartMediaResourcesFromSelection(
  selection: ApplicationResourceSelection,
): ChartMediaResources {
  return Object.freeze({
    bgm: selection["chart-media.bgm"],
    cover: selection["chart-media.cover"],
    mv: selection["chart-media.mv"],
    stageBackdrop: selection["chart-media.stage-backdrop"],
  });
}

export function skinResourcesFromSelection(
  selection: ApplicationResourceSelection,
): SkinResourceSelection {
  return Object.freeze({
    rhythm: selection["skin.rhythm"],
    directional: selection["skin.directional"],
    rhythmSe: selection["skin.rhythm-se"],
    directionalSe: selection["skin.directional-se"],
    field: selection["skin.field"],
    background: selection["skin.background"],
    judge: selection["skin.judge"],
    commonSe: selection["skin.common-se"],
  });
}

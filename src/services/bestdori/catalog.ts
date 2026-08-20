import type { ResourceRef } from "../../resources/contracts";
import type {
  BestdoriAssetFamily,
  BestdoriAssetServer,
} from "./api";

export type BestdoriCatalogKind =
  | "rhythm"
  | "habahiroRhythm"
  | "directional"
  | "rhythmSe"
  | "directionalSe"
  | "bg"
  | "field"
  | "judge";

export interface BestdoriCatalogResource {
  readonly ref: ResourceRef;
  readonly server: BestdoriAssetServer;
  readonly family: BestdoriAssetFamily;
  readonly id: string;
  readonly title: string;
}

export interface BestdoriSkinCatalogOptions {
  readonly rhythm: string[];
  readonly habahiroRhythm: string[];
  readonly directional: string[];
  readonly rhythmSe: string[];
  readonly directionalSe: string[];
  readonly bg: string[];
  readonly field: string[];
  readonly judge: string[];
  readonly labels: Record<BestdoriCatalogKind, Record<string, string>>;
  readonly resources: Record<BestdoriCatalogKind, Record<string, BestdoriCatalogResource>>;
}

export function buildEmptyBestdoriSkinCatalogOptions(): BestdoriSkinCatalogOptions {
  return buildOptions({
    rhythm: [],
    habahiroRhythm: [],
    directional: [],
    rhythmSe: [],
    directionalSe: [],
    bg: [],
    field: [],
    judge: [],
  });
}

export function buildBestdoriSkinCatalogOptionsFromDescriptors(
  descriptors: readonly import("../../resources/contracts").NetworkResourceDescriptor[],
): BestdoriSkinCatalogOptions {
  const groups: Record<BestdoriCatalogKind, BestdoriCatalogResource[]> = {
    rhythm: [],
    habahiroRhythm: [],
    directional: [],
    rhythmSe: [],
    directionalSe: [],
    bg: [],
    field: [],
    judge: [],
  };
  for (const descriptor of descriptors) {
    const family = descriptor.source.family as BestdoriAssetFamily;
    const id = descriptor.source.nativeId;
    const resource: BestdoriCatalogResource = Object.freeze({
      ref: descriptor.ref,
      server: descriptor.source.server as BestdoriAssetServer,
      family,
      id,
      title: descriptor.title,
    });
    if (family === "noteskin") {
      if (id === "habahiro") groups.habahiroRhythm.push(resource);
      else if (id.startsWith("directionalflick") && !id.endsWith("sample")) groups.directional.push(resource);
      else if (!id.endsWith("sample")) groups.rhythm.push(resource);
    } else if (family === "tapseskin") {
      if (id.startsWith("directionalflick")) groups.directionalSe.push(resource);
      else groups.rhythmSe.push(resource);
    } else if (family === "bgskin") {
      if (!id.endsWith("preview")) groups.bg.push(resource);
    } else if (family === "fieldskin") groups.field.push(resource);
    else if (family === "judgeskin") groups.judge.push(resource);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) =>
      serverPriority(a.server) - serverPriority(b.server) ||
      a.id.localeCompare(b.id));
  }
  return buildOptions(groups);
}

function buildOptions(
  groups: Record<BestdoriCatalogKind, BestdoriCatalogResource[]>,
): BestdoriSkinCatalogOptions {
  const labels = {} as Record<BestdoriCatalogKind, Record<string, string>>;
  const resources = {} as Record<BestdoriCatalogKind, Record<string, BestdoriCatalogResource>>;
  for (const [kind, list] of Object.entries(groups) as Array<
    [BestdoriCatalogKind, BestdoriCatalogResource[]]
  >) {
    labels[kind] = {};
    resources[kind] = {};
    for (const item of list) {
      resources[kind][item.id] = item;
      labels[kind][item.id] = item.title;
    }
  }
  return {
    rhythm: groups.rhythm.map((item) => item.id),
    habahiroRhythm: groups.habahiroRhythm.map((item) => item.id),
    directional: groups.directional.map((item) => item.id),
    rhythmSe: groups.rhythmSe.map((item) => item.id),
    directionalSe: groups.directionalSe.map((item) => item.id),
    bg: groups.bg.map((item) => item.id),
    field: groups.field.map((item) => item.id),
    judge: groups.judge.map((item) => item.id),
    labels,
    resources,
  };
}

function serverPriority(server: BestdoriAssetServer): number {
  return server === "jp" ? 0 : server === "en" ? 1 : server === "tw" ? 2 : server === "cn" ? 3 : 4;
}

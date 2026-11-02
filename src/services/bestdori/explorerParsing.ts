import { ResponseShapeError, arrayOf, idKey, integer, record, recordOf, string } from "../responseShape";
import { parsePerServer, type BestdoriPerServerValue } from "./songParsing";

/*
 * Bestdori's asset explorer and skin name tables, per real responses for all five servers.
 */

/**
 * /api/explorer/{server}/assets/_info.json: the asset tree. A folder maps names to subfolders or
 * to asset bundles; a bundle is its file count (a non-negative integer, 0 for an empty bundle).
 */
export type BestdoriExplorerNode = number | BestdoriExplorerFolder;
export interface BestdoriExplorerFolder { [name: string]: BestdoriExplorerNode }
function parseNode(value: unknown, path: string): BestdoriExplorerNode {
  if (typeof value === "number") {
    if (integer(value, path) < 0) throw new ResponseShapeError(path, "非负整数");
    return value;
  }
  return parseFolder(value, path);
}
function parseFolder(value: unknown, path: string): BestdoriExplorerFolder {
  return recordOf(value, path, parseNode);
}
export function parseBestdoriExplorerInfo(value: unknown, path = "info"): BestdoriExplorerFolder {
  return parseFolder(value, path);
}
/** The folder at a path in the tree; undefined where the path is missing or names a bundle. */
export function explorerFolder(node: BestdoriExplorerNode | undefined, ...names: string[]): BestdoriExplorerFolder | undefined {
  let current = node;
  for (const name of names) current = typeof current === "object" ? current[name] : undefined;
  return typeof current === "object" ? current : undefined;
}

/** /api/explorer/{server}/assets/<folder>.json: the file names of a bundle. */
export function parseBestdoriFileList(value: unknown, path = "files"): string[] {
  return arrayOf(value, path, string);
}

/**
 * /api/skin/{notes,directionalFlicks,lanes,effects,backgrounds}.all.3.json: skins by id, their
 * bundle and per-server name (null where a server lacks the skin).
 */
export interface BestdoriSkinName { assetBundleName: string; skinName: BestdoriPerServerValue<string> }
export function parseBestdoriSkinNames(value: unknown, path = "skins"): Record<string, BestdoriSkinName> {
  return recordOf(value, path, (item, itemPath) => {
    const skin = record(item, itemPath);
    return { assetBundleName: string(skin.assetBundleName, `${itemPath}.assetBundleName`),
      skinName: parsePerServer(skin.skinName, `${itemPath}.skinName`, string) };
  }, idKey);
}

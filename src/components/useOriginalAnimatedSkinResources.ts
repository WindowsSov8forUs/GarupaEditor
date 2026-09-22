import { originalSkinResourceRef } from "../resources/originalSkinResourceRef";
import { useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { type ResourceConsumerLease } from "../resources/contracts";
import { readOriginalPreviewSprites, type OriginalPreviewSprite } from "./originalPreviewSprites";
import { type ResolvedOriginalSkinRecipe } from "../simulator/public/settings";
import { simulatorBuiltinResourceRef } from "../resources/builtin/simulatorBuiltinResourceCatalog";
import { parseOriginalPreviewFlickAnimations, type OriginalPreviewFlickAnimations, type OriginalPreviewFlickDirection } from "../simulator/public/preview";
import type { OriginalPreviewNoteType } from "./originalSkinPreviewMotion";

export interface OriginalAnimatedSkinResources {
  readonly key: string;
  readonly bodies: Readonly<Record<OriginalPreviewNoteType, OriginalPreviewSprite>>;
  readonly longNoteLine: string;
  readonly flickTops: Readonly<Record<OriginalPreviewFlickDirection, OriginalPreviewSprite>>;
  readonly flickAnimations: OriginalPreviewFlickAnimations;
}
const basename = (value: string) => value.replace(/\\/g, "/").split("/").pop()!.toLowerCase();

export function useOriginalAnimatedSkinResources(recipe: ResolvedOriginalSkinRecipe,
  onError?: (message: string) => void): OriginalAnimatedSkinResources | null {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const noteResource = recipe.note.logicalResource!, directionalResource = recipe.directional.noteLogicalResource;
  const key = `${noteResource}:${directionalResource}`;
  const [result, setResult] = useState<OriginalAnimatedSkinResources | null>(null);
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const derived = new Set<string>();
    const release = () => {
      derived.forEach(url => URL.revokeObjectURL(url)); derived.clear();
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(error => console.error("Animated preview cleanup failed", error));
    };
    const createImageUrl = async (canvas: HTMLCanvasElement): Promise<string> => {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
        value ? resolve(value) : reject(new Error("Preview sprite encoding failed."))));
      const url = URL.createObjectURL(blob); derived.add(url); return url;
    };
    setResult(null);
    void (async () => {
      const ids = [noteResource.split("/").pop()!, directionalResource.split("/").pop()!];
      const refs = [noteResource, directionalResource].map(logical => {
        const value = originalSkinResourceRef(logical);
        if (value.status === "rejected") throw new Error(value.failure.boundary);
        return value.value;
      });
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const animationRef = simulatorBuiltinResourceRef("portable/profiles/ordinary-visible");
      if (animationRef.status === "rejected") throw new Error(animationRef.failure.boundary);
      const snapshot = await manager.createSnapshotFromRefs({ "preview.motion.note": refs[0]!,
        "preview.motion.directional": refs[1]!, "preview.motion.animations": animationRef.value });
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const profiles = lease.listFiles("preview.motion.animations").filter(file => basename(file.logicalPath) === "profile.json");
      if (profiles.length !== 1) throw new Error("Original preview requires one animation profile.");
      const flickAnimations = parseOriginalPreviewFlickAnimations(JSON.parse(new TextDecoder("utf-8", { fatal: true })
        .decode(await lease.readBytes("preview.motion.animations", profiles[0]!.logicalPath))));
      // Crop only the sprites consumed by the preview, through the live skin decoder.
      // Keep decoding sequential so a failed decoder cannot release a sibling's lease.
      const note = await readOriginalPreviewSprites(lease, "preview.motion.note", ids[0]!, createImageUrl,
        new Set(["note_normal_3", "note_skill_3", "note_flick_3", "note_long_3", flickAnimations.directionalSpriteKeys.up]));
      const directional = await readOriginalPreviewSprites(lease, "preview.motion.directional", ids[1]!, createImageUrl,
        new Set(["note_flick_r_3", "note_flick_l_3", flickAnimations.directionalSpriteKeys.left, flickAnimations.directionalSpriteKeys.right]));
      const take = (source: ReadonlyMap<string, OriginalPreviewSprite>, name: string) => {
        const sprite = source.get(name);
        if (!sprite) throw new Error(`Original preview sprite is missing: ${name}.`);
        return sprite;
      };
      const bodies = {
        0: take(note, "note_normal_3"), 1: take(note, "note_skill_3"), 2: take(note, "note_flick_3"),
        3: take(note, "note_long_3"), 5: take(note, "note_long_3"),
        6: take(directional, "note_flick_r_3"), 7: take(directional, "note_flick_l_3"),
      };
      const lines = lease.listFiles("preview.motion.note").filter(file => basename(file.logicalPath) === "longnoteline.png");
      if (lines.length !== 1) throw new Error("Original preview requires one longNoteLine texture.");
      const longNoteLine = await lease.openObjectUrl("preview.motion.note", lines[0]!.logicalPath);
      const flickTops = { up: take(note, flickAnimations.directionalSpriteKeys.up),
        left: take(directional, flickAnimations.directionalSpriteKeys.left),
        right: take(directional, flickAnimations.directionalSpriteKeys.right) };
      if (active) setResult({ key, bodies, longNoteLine, flickTops, flickAnimations });
    })().catch(error => {
      if (active) report.current?.(error instanceof Error ? error.message : String(error));
      release();
    }).finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager, key, noteResource, directionalResource]);
  return result?.key === key ? result : null;
}

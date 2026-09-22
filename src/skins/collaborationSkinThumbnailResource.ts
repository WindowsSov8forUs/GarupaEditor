import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import { originalSkinResourceRef } from "../resources/originalSkinResourceRef";
import { readOriginalPreviewSprites } from "../components/originalPreviewSprites";
import { generateCollaborationSkinThumbnail } from "./generateCollaborationSkinThumbnail";

type Skin = { readonly notesBundleName: string | null; readonly laneBundleName: string | null };
const pending = new WeakMap<ApplicationResourceManager, Map<string, Promise<Blob>>>();
const basename = (path: string) => path.replace(/\\/g, "/").split("/").pop()!.toLowerCase();

export function collaborationThumbnailSources(skin: Skin) {
  const noteName = skin.notesBundleName ?? "skin00", fieldName = skin.laneBundleName ?? "skin00";
  const note = originalSkinResourceRef(`ingameskin/noteskin/${noteName}`);
  const field = originalSkinResourceRef(`ingameskin/fieldskin/${fieldName}`);
  if (note.status === "rejected" || field.status === "rejected") throw new Error("联动皮肤资源标识无效");
  return { noteName, isolateFieldBody: fieldName === "skin_gbp2020",
    refs: { note: note.value, field: field.value } };
}

/** Shared by background preparation and the picker; never writes into a provider package. */
export function loadCollaborationSkinThumbnail(manager: ApplicationResourceManager, skin: Skin): Promise<Blob> {
  const source = collaborationThumbnailSources(skin);
  const pair = JSON.stringify(source.refs);
  let jobs = pending.get(manager);
  if (!jobs) { jobs = new Map(); pending.set(manager, jobs); }
  const existing = jobs.get(pair);
  if (existing) return existing;
  const job = load(manager, source).finally(() => jobs.delete(pair));
  jobs.set(pair, job);
  return job;
}

async function load(manager: ApplicationResourceManager, source: ReturnType<typeof collaborationThumbnailSources>): Promise<Blob> {
  const snapshot = await manager.createSnapshotFromRefs(source.refs);
  if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
  const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
  if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
  const lease = acquired.value, temporaryUrls: string[] = [];
  try {
    // Bump this version whenever the composition or representative Sprite changes.
    const key = JSON.stringify([source.isolateFieldBody ? "collaboration-v7-canvas-gbp-body-2" : "collaboration-v7-canvas-1", source.refs.note.id, lease.revisions.note,
      source.refs.field.id, lease.revisions.field]);
    const cached = await manager.readSkinThumbnail(key);
    if (cached.status === "rejected") throw new Error(cached.failure.boundary);
    if (cached.value) return new Blob([new Uint8Array(cached.value)], { type: "image/png" });
    const readFieldImage = async (name: string) => {
      const file = lease.listFiles("field").find(file => basename(file.logicalPath) === name);
      if (!file) throw new Error(`Missing field texture: ${name}`);
      return new Blob([new Uint8Array(await lease.readBytes("field", file.logicalPath))], { type: "image/png" });
    };
    let note: Blob | null = null;
    await readOriginalPreviewSprites(lease, "note", source.noteName, async canvas => {
      note = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
        blob ? resolve(blob) : reject(new Error("音符素材编码失败"))));
      const url = URL.createObjectURL(note); temporaryUrls.push(url); return url;
    }, new Set(["note_normal_3"]));
    if (!note) throw new Error(`Missing center-lane note: ${source.noteName}`);
    const blob = await generateCollaborationSkinThumbnail({ note, isolateFieldBody: source.isolateFieldBody,
      field: await readFieldImage("bg_line_rhythm.png"), judge: await readFieldImage("game_play_line.png") });
    const written = await manager.writeSkinThumbnail(key, new Uint8Array(await blob.arrayBuffer()));
    if (written.status === "rejected") throw new Error(written.failure.boundary);
    return blob;
  } finally {
    temporaryUrls.forEach(url => URL.revokeObjectURL(url));
    await lease.release();
  }
}

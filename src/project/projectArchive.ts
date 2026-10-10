import { unzipSync, zipSync } from "fflate";
import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import { createResourceRef, ResourceFailureError, type UserMediaPurpose } from "../resources/contracts";
import { observeResourceIntegrity } from "../resources/sha256";
import { canonicalJson, PROJECT_MEDIA_ROLES, readChartProject, type ChartProject } from "./chartProject";
import { leaseProjectMedia, rememberProjectMedia } from "./projectResources";

const mediaPath = (hash: string) => `media/${hash}`;

export async function exportProjectArchive(manager: ApplicationResourceManager, project: ChartProject): Promise<Uint8Array> {
  const lease = await leaseProjectMedia(manager, project);
  try {
    const files: Record<string, Uint8Array> = { "project.json": new TextEncoder().encode(canonicalJson(project)) };
    for (const role of PROJECT_MEDIA_ROLES) {
      const media = project.media[role]; if (!media) continue;
      const path = mediaPath(media.integrity.sha256);
      if (!files[path]) files[path] = await lease!.readBytes(role, lease!.listFiles(role)[0].logicalPath);
    }
    // Media is already compressed. Store exact bytes; fixed ZIP dates keep repeated exports reproducible.
    return zipSync(files, { level: 0, mtime: new Date(2000, 0, 1) });
  } finally { await lease?.release(); }
}

export async function readProjectArchive(bytes: Uint8Array): Promise<{ project: ChartProject; media: Record<string, Uint8Array> }> {
  let manifestCount = 0;
  const manifest = unzipSync(bytes, { filter: file => {
    if (file.name !== "project.json") return false;
    if (++manifestCount !== 1) throw new Error("项目包含有重复清单");
    return true;
  } })["project.json"];
  if (!manifest) throw new Error("项目包缺少 project.json");
  const project = await readChartProject(new TextDecoder("utf-8", { fatal: true }).decode(manifest));
  const wanted = new Map(Object.values(project.media).flatMap(m => m ? [[mediaPath(m.integrity.sha256), m] as const] : []));
  const seen = new Set<string>();
  const media = unzipSync(bytes, { filter: file => {
    const expected = wanted.get(file.name); if (!expected) return false;
    if (seen.has(file.name) || file.originalSize !== expected.integrity.byteLength) throw new Error(`项目媒体目录不匹配：${file.name}`);
    seen.add(file.name); return true;
  } });
  for (const [path, expected] of wanted) {
    const data = media[path];
    if (!data) throw new Error(`项目包缺少媒体：${expected.fileName}`);
    const hash = await observeResourceIntegrity(data);
    if (hash.status === "rejected") throw new ResourceFailureError(hash.failure);
    if (hash.value.sha256 !== expected.integrity.sha256) throw new Error(`项目媒体校验失败：${expected.fileName}`);
  }
  return { project, media };
}

/** All bytes are verified before installation. The active editor is only changed by the caller after success. */
export async function importProjectArchive(manager: ApplicationResourceManager, bytes: Uint8Array): Promise<ChartProject> {
  const { project, media } = await readProjectArchive(bytes);
  for (const role of PROJECT_MEDIA_ROLES) {
    const item = project.media[role]; if (!item) continue;
    const purpose = (role === "stageBackdrop" ? "stage-backdrop" : role) as UserMediaPurpose;
    const existingRef = createResourceRef(`workspace/current/chart-media/${purpose}/${item.integrity.sha256.toLowerCase()}`);
    if (existingRef.status === "rejected") throw new ResourceFailureError(existingRef.failure);
    const existing = await manager.verify(existingRef.value);
    if (existing.status === "accepted" && existing.value.files?.length === 1
      && existing.value.files[0].integrity.sha256 === item.integrity.sha256
      && existing.value.files[0].integrity.byteLength === item.integrity.byteLength) {
      item.ref = existingRef.value;
      continue;
    }
    const installed = await manager.importWorkspaceMedia({
      purpose,
      fileName: item.fileName, mediaType: item.mediaType, bytes: media[mediaPath(item.integrity.sha256)],
    });
    if (installed.status === "rejected") throw new ResourceFailureError(installed.failure);
    if (installed.value.files?.[0]?.integrity.sha256 !== item.integrity.sha256) throw new Error(`项目媒体安装内容不符：${item.fileName}`);
    item.ref = installed.value.ref;
  }
  rememberProjectMedia(manager, project);
  return project;
}

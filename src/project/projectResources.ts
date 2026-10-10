import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import { ResourceFailureError, type ResourceConsumerLease } from "../resources/contracts";
import { PROJECT_FORMAT, PROJECT_MEDIA_ROLES, canonicalJson, projectContent, projectHash, validateProject,
  type ChartProject, type ChartProjectDraft, type ProjectMedia, type ProjectMediaRole } from "./chartProject";

// Workspace IDs are content-addressed. Reuse metadata rather than rehashing an MV on every autosave.
const metadataCaches = new WeakMap<ApplicationResourceManager, Map<string, ProjectMedia>>();
function cache(manager: ApplicationResourceManager) {
  let value = metadataCaches.get(manager);
  if (!value) { value = new Map(); metadataCaches.set(manager, value); }
  return value;
}
export function rememberProjectMedia(manager: ApplicationResourceManager, project: ChartProject): void {
  for (const item of Object.values(project.media)) if (item?.ref.id.startsWith("workspace/")) cache(manager).set(item.ref.id, item);
}
export async function captureChartProject(manager: ApplicationResourceManager, input: ChartProjectDraft): Promise<ChartProject> {
  // Own the data before the first await; editing may continue while files are resolved.
  const draft: ChartProjectDraft = JSON.parse(canonicalJson(input));
  const media = {} as Record<ProjectMediaRole, ProjectMedia | null>;
  for (const role of PROJECT_MEDIA_ROLES) {
    const ref = draft.mediaRefs[role];
    if (!ref) { media[role] = null; continue; }
    const existing = ref.id.startsWith("workspace/") ? cache(manager).get(ref.id) : undefined;
    if (existing) { media[role] = existing; continue; }
    const resolved = await manager.ensureAvailable(ref);
    if (resolved.status === "rejected") throw new ResourceFailureError(resolved.failure);
    const files = resolved.value.files;
    if (files?.length !== 1) throw new Error(`项目媒体 ${role} 必须引用一个独立文件`);
    const file = files[0];
    const entry: ProjectMedia = { ref, fileName: "fileName" in resolved.value ? String(resolved.value.fileName) : file.logicalPath,
      mediaType: file.mediaType, integrity: file.integrity };
    media[role] = entry;
    if (ref.id.startsWith("workspace/")) cache(manager).set(ref.id, entry);
  }
  const body: Omit<ChartProject, "contentHash"> = { format: PROJECT_FORMAT, schemaVersion: 1 as const, semanticsVersion: 1 as const,
    projectId: draft.projectId, metadata: draft.metadata, chart: draft.chart, media,
    audioFileName: draft.audioFileName, audioDurationSec: draft.audioDurationSec };
  const project: ChartProject = { ...body, contentHash: await projectHash(projectContent(body)) };
  validateProject(project);
  return project;
}
export async function leaseProjectMedia(manager: ApplicationResourceManager, project: ChartProject): Promise<ResourceConsumerLease | null> {
  const slots = Object.fromEntries(PROJECT_MEDIA_ROLES.flatMap(role => project.media[role] ? [[role, project.media[role]!.ref]] : []));
  if (!Object.keys(slots).length) return null;
  const receipt = await manager.createSnapshotFromRefs(slots);
  if (receipt.status === "rejected") throw new ResourceFailureError(receipt.failure);
  const lease = await manager.acquireSnapshot(receipt.value.snapshotId);
  if (lease.status === "rejected") throw new ResourceFailureError(lease.failure);
  try {
    for (const role of PROJECT_MEDIA_ROLES) {
      const expected = project.media[role]; if (!expected) continue;
      const files = lease.value.listFiles(role);
      if (files.length !== 1 || files[0].integrity.sha256 !== expected.integrity.sha256
        || files[0].integrity.byteLength !== expected.integrity.byteLength) throw new Error(`项目媒体 ${role} 内容与保存版本不符`);
    }
    return lease.value;
  } catch (error) { await lease.value.release(); throw error; }
}

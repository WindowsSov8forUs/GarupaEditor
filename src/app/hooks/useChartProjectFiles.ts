import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntimeEnvironment } from "../../services/bestdori/transport";
import { isMobileRuntime } from "../mobileRuntime";
import { startOperation } from "../../logging/applicationLogger";
import { userFacingErrorMessage } from "../../services/downloadError";
import type { ApplicationResourceManager } from "../../resources/applicationResourceManager";
import { captureChartProject } from "../../project/projectResources";
import type { ChartProject, ChartProjectDraft } from "../../project/chartProject";

export function useChartProjectFiles(manager: ApplicationResourceManager, draft: ChartProjectDraft,
  restore: (project: ChartProject) => void, status: (message: string) => void) {
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const afterOpen = useRef<(() => void) | undefined>(undefined);
  const afterCancel = useRef<(() => void) | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const latest = useRef(draft); latest.current = draft;
  const run = async (kind: "open" | "save", action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const finish = startOperation(`project.${kind}`, { projectId: draft.projectId });
    try { await action(); finish(); }
    catch (error) { finish(error); status(`项目${kind === "open" ? "打开" : "保存"}失败：${userFacingErrorMessage(error)}`); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const save = () => run("save", async () => {
    status("正在准备完整谱面项目…");
    const project = await captureChartProject(manager, draft);
    const { exportProjectArchive } = await import("../../project/projectArchive");
    const bytes = await exportProjectArchive(manager, project);
    if (isTauriRuntimeEnvironment() && !isMobileRuntime()) {
      // Raw IPC avoids base64 and JSON number-array expansion for BGM/MV payloads.
      const path = await invoke<string | null>("save_chart_project_via_dialog", bytes);
      status(path ? `项目已保存到 ${path}` : "已取消保存项目。");
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `${project.metadata.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "chart"}.gcp`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status("已导出完整谱面项目。");
    }
  });
  const cancel = () => {
    const notify = afterCancel.current;
    afterOpen.current = undefined; afterCancel.current = undefined;
    notify?.();
  };
  useEffect(() => {
    const element = input.current;
    element?.addEventListener("cancel", cancel);
    return () => element?.removeEventListener("cancel", cancel);
  }, []);
  const open = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
    if (!file) { cancel(); return; }
    const onLoaded = afterOpen.current;
    afterOpen.current = undefined; afterCancel.current = undefined;
    const before = latest.current;
    void run("open", async () => {
      if (!/\.gcp$/i.test(file.name)) throw new Error("请选择 .gcp 项目文件。");
      status("正在读取谱面项目…");
      const { importProjectArchive } = await import("../../project/projectArchive");
      const project = await importProjectArchive(manager, new Uint8Array(await file.arrayBuffer()));
      if (latest.current !== before) throw new Error("读取期间当前谱面发生了修改，已保留当前内容，请重新打开项目。");
      restore(project); onLoaded?.(); status(`已打开项目：${project.metadata.title}`);
    });
  };
  return { input, busy, save, open, cancel, choose: (onLoaded?: () => void, onCancelled?: () => void) => {
    if (!busyRef.current) { afterOpen.current = onLoaded; afterCancel.current = onCancelled; input.current?.click(); }
  } };
}

import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import { startOperation } from "../logging/applicationLogger";
import { bootstrapApplicationResources } from "../resources/applicationResources";
import { preloadSkinResources } from "../resources/preloadSkinResources";
import { bootstrapOfficialMusic } from "../services/officialMusicLibrary";
import { listApplicationBuiltinImages } from "../resources/builtin/builtinResourceCatalog";
import { preloadApplicationRoutes } from "../App";

/** Startup owns these operations; pages consume their already-prepared results. */
export async function prepareApplication(progress: (ratio: number) => void, onManager?: (manager: ApplicationResourceManager) => void) {
  const finish = startOperation("application.startup.prepare");
  try {
    const result = await prepare(progress, onManager);
    finish(undefined, { warningCount: result.warnings.length });
    return result;
  } catch (error) { finish(error); throw error; }
}

async function prepare(progress: (ratio: number) => void, onManager?: (manager: ApplicationResourceManager) => void) {
  const result = await bootstrapApplicationResources(async manager => { onManager?.(manager); });
  if (result.status === "rejected") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
  const manager = result.value;
  onManager?.(manager);
  const fractions = [0, 0, 0];
  const weights = [0.4, 0.35, 0.1];
  const report = (stage: number, fraction: number) => {
    fractions[stage] = Math.max(fractions[stage]!, Math.min(1, Math.max(0, fraction)));
    progress(0.05 + fractions.reduce((sum, value, index) => sum + value * weights[index]!, 0));
  };
  progress(0.05);
  const stage = async <T,>(name: string, action: () => Promise<T>): Promise<T> => {
    const finish = startOperation(`application.startup.${name}`);
    try { const value = await action(); finish(); return value; }
    catch (error) { finish(error); throw error; }
  };
  // Only skins depend on the Bestdori catalog. Local presentation and the
  // official library can prepare independently; drain all branches on failure
  // before allowing a retry to start another preparation attempt.
  const results = await Promise.allSettled([
    stage("official-library", () => bootstrapOfficialMusic(manager, ratio => report(0, ratio))),
    stage("skins", async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      return preloadSkinResources(manager, (done, total) => report(1, total ? done / total : 1));
    }),
    stage("presentation", async () => {
      const images = listApplicationBuiltinImages();
      let cursor = 0, completed = 0;
      const work = [preloadApplicationRoutes(),
        ...["TTShinGoM", "GB18030", "ChartUI"].map(name => document.fonts.load(`16px "${name}"`)),
        ...Array.from({ length: 4 }, async () => {
          while (cursor < images.length) {
            const entry = images[cursor++]!;
            const image = new Image(); image.src = entry.url;
            await image.decode();
            report(2, ++completed / images.length);
          }
        })];
      const settled = await Promise.allSettled(work);
      const failure = settled.find(item => item.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      await document.fonts.ready;
      report(2, 1);
    }),
  ] as const);
  const unwrap = <T,>(result: PromiseSettledResult<T>): T => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  };
  const library = unwrap(results[0]), skins = unwrap(results[1]);
  unwrap(results[2]);
  progress(0.9);
  // Optional archive resources may be unavailable offline. They are reported
  // explicitly before entry; current editor resources remain a separate barrier.
  const warnings = [library.error, library.mediaFailures.length ? `官方曲库仍有 ${library.mediaFailures.length} 项资源未准备完成：\n${library.mediaFailures.join("\n")}` : "",
    skins.failures.length ? `仍有 ${skins.failures.length} 项皮肤资源未准备完成：\n${skins.failures.join("\n")}` : "",
    skins.unpublished.length ? `Bestdori 尚未提供 ${skins.unpublished.length} 项皮肤资源（未发起下载）：\n${skins.unpublished.join("\n")}` : ""].filter(Boolean);
  return { manager, warnings };
}

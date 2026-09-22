export interface CollaborationThumbnailInput {
  readonly field: Blob;
  readonly judge: Blob;
  /** Decoded center-lane Sprite, using the same source decoder as the preview. */
  readonly note: Blob;
  /** GBP field artwork includes stars outside the continuous lane body. */
  readonly isolateFieldBody?: boolean;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: Blob) => void; reject: (error: Error) => void }>();

/** The approved thumbnail composition runs off the UI thread. No resource I/O. */
export function generateCollaborationSkinThumbnail(input: CollaborationThumbnailInput): Promise<Blob> {
  if (!worker) {
    worker = new Worker(new URL("./skinThumbnail.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.blob) request.resolve(event.data.blob);
      else request.reject(new Error(event.data.error ?? "缩略图生成失败"));
    };
    worker.onerror = event => {
      for (const request of pending.values()) request.reject(new Error(event.message));
      pending.clear(); worker?.terminate(); worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { worker!.postMessage({ id, input }); }
    catch (cause) { pending.delete(id); reject(cause); }
  });
}

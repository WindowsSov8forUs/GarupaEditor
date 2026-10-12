import type { CollaborationThumbnailInput } from "./generateCollaborationSkinThumbnail";
import { composeCollaborationThumbnail } from "./skinThumbnailRenderer";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ id: number; input: CollaborationThumbnailInput }>) => void;
  postMessage: (message: unknown) => void;
};
let queue = Promise.resolve();
scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try { scope.postMessage({ id: data.id, blob: await composeCollaborationThumbnail(data.input) }); }
    catch (cause) { scope.postMessage({ id: data.id, error: String(cause) }); }
  });
};

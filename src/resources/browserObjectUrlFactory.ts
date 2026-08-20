import type { ResourceObjectUrlFactory } from "./backend";

export class BrowserResourceObjectUrlFactory implements ResourceObjectUrlFactory {
  create(bytes: Uint8Array, mediaType: string): string {
    if (
      typeof URL !== "function" && typeof URL !== "object" ||
      typeof URL.createObjectURL !== "function" ||
      typeof Blob !== "function"
    ) {
      throw new Error("resource object URL platform is unavailable");
    }
    return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mediaType }));
  }

  revoke(url: string): void {
    URL.revokeObjectURL(url);
  }
}

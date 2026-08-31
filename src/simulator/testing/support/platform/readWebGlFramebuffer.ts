import type { Application } from "pixi.js";

export function readWebGlFramebufferRgba(
  app: Application,
  width: number,
  height: number,
): Uint8Array {
  const gl = (app.renderer as unknown as { readonly gl?: WebGL2RenderingContext }).gl;
  if (gl === undefined || app.canvas.width !== width || app.canvas.height !== height) {
    throw new Error("WebGL framebuffer observation requires the exact rendered backing-store viewport.");
  }
  const bottomUp = new Uint8Array(width * height * 4);
  gl.finish();
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
  const topDown = new Uint8Array(bottomUp.length);
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    topDown.set(
      bottomUp.subarray(row * stride, (row + 1) * stride),
      (height - 1 - row) * stride,
    );
  }
  return topDown;
}

/** Shared Home/result image fitting. The crop fades into the page, not into a solid color. */
export function displayImageFit(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scale, drawnHeight = sourceHeight * scale;
  return {
    width, height, scale, x: (width - drawnWidth) / 2, y: (height - drawnHeight) / 2,
    fadeX: drawnWidth > width + 0.001 ? Math.min(32, width / 12) : 0,
    fadeY: drawnHeight > height + 0.001 ? Math.min(32, height / 12) : 0,
  };
}

export function createDisplayImageMask(fit: ReturnType<typeof displayImageFit>, channel: "alpha" | "red") {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(fit.width); canvas.height = Math.ceil(fit.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Display image edge mask requires a 2D canvas.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = channel === "alpha" ? "destination-in" : "multiply";
  for (const axis of ["x", "y"] as const) {
    const fade = axis === "x" ? fit.fadeX / fit.width : fit.fadeY / fit.height;
    if (fade === 0) continue;
    const gradient = context.createLinearGradient(0, 0, axis === "x" ? canvas.width : 0, axis === "y" ? canvas.height : 0);
    const transparent = channel === "alpha" ? "rgba(255,255,255,0)" : "#000";
    gradient.addColorStop(0, transparent); gradient.addColorStop(fade, "#fff");
    gradient.addColorStop(1 - fade, "#fff"); gradient.addColorStop(1, transparent);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

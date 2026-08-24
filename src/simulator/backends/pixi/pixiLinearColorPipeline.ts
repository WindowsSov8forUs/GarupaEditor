import {
  Filter,
  GlProgram,
  Rectangle,
  type Container,
} from "pixi.js";

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const FILTER_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
float linearChannelToSrgb(float value) {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * pow(max(value, 0.0), 1.0 / 2.4) - 0.055;
}
vec3 linearToSrgb(vec3 value) {
  return vec3(
    linearChannelToSrgb(value.r),
    linearChannelToSrgb(value.g),
    linearChannelToSrgb(value.b)
  );
}
void main(void) {
  vec4 premultiplied = texture(uTexture, vTextureCoord);
  if (premultiplied.a <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  vec3 straightLinear = clamp(premultiplied.rgb / premultiplied.a, 0.0, 1.0);
  finalColor = vec4(linearToSrgb(straightLinear) * premultiplied.a, premultiplied.a);
}`;

export interface PixiLinearOutputOwner {
  update(width: number, height: number): void;
  dispose(): void;
}

export function installPixiLinearOutput(
  root: Container,
  width: number,
  height: number,
): PixiLinearOutputOwner {
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: FILTER_VERTEX,
      fragment: FILTER_FRAGMENT,
      name: "garupa-linear-to-srgb-output",
    }),
    resolution: "inherit",
    antialias: "inherit",
    clipToViewport: true,
  });
  const update = (nextWidth: number, nextHeight: number): void => {
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) ||
      nextWidth <= 0 || nextHeight <= 0) {
      throw new Error("Linear output filter requires one positive finite viewport.");
    }
    root.filterArea = new Rectangle(0, 0, nextWidth, nextHeight);
  };
  update(width, height);
  root.filters = [filter];
  let disposed = false;
  return Object.freeze({
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.filters = null;
      root.filterArea = undefined;
      filter.destroy(true);
    },
  });
}

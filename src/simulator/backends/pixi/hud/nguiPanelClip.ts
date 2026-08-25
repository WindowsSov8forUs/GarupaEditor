import { Filter, GlProgram, UniformGroup } from "pixi.js";

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uSoftness;
void main(void) {
  vec4 sampleColor = texture(uTexture, vTextureCoord);
  vec2 edge = min(vTextureCoord, vec2(1.0) - vTextureCoord);
  vec2 softness = max(uSoftness, vec2(0.000001));
  float clipAlpha = smoothstep(0.0, softness.x, edge.x) *
                    smoothstep(0.0, softness.y, edge.y);
  finalColor = sampleColor * clipAlpha;
}`;

export interface NguiSoftClipFilter extends Filter {
  readonly resources: Filter["resources"] & {
    readonly softClipUniforms: UniformGroup<{
      uSoftness: { value: Float32Array; type: "vec2<f32>" };
    }>;
  };
}

export function createNguiSoftClipFilter(
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): NguiSoftClipFilter {
  if (![clipWidth, clipHeight, softnessX, softnessY].every(Number.isFinite) ||
    clipWidth <= 0 || clipHeight <= 0 || softnessX < 0 || softnessY < 0) {
    throw new Error("NGUI SoftClip requires finite positive clip dimensions and non-negative softness.");
  }
  const uniforms = new UniformGroup({
    uSoftness: {
      value: softnessVector(clipWidth, clipHeight, softnessX, softnessY),
      type: "vec2<f32>",
    },
  });
  return new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "ngui-soft-clip" }),
    resources: { softClipUniforms: uniforms },
    padding: Math.max(softnessX, softnessY),
    antialias: "inherit",
  }) as NguiSoftClipFilter;
}

export function updateNguiSoftClipFilter(
  filter: NguiSoftClipFilter,
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): void {
  filter.resources.softClipUniforms.uniforms.uSoftness =
    softnessVector(clipWidth, clipHeight, softnessX, softnessY);
}

function softnessVector(
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): Float32Array {
  return new Float32Array([
    Math.fround(softnessX / clipWidth),
    Math.fround(softnessY / clipHeight),
  ]);
}

import { Filter, GlProgram, UniformGroup } from "pixi.js";

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vClipCoordinate;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform vec4 uClipRange0;
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
  vec2 panelPosition = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vClipCoordinate = panelPosition * uClipRange0.zw + uClipRange0.xy;
}`;

const FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vClipCoordinate;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uClipArgs0;
void main(void) {
  vec4 sampleColor = texture(uTexture, vTextureCoord);
  float alphaPolynomial = sampleColor.a * 0.305299997 + 0.682200015;
  alphaPolynomial = sampleColor.a * alphaPolynomial + 0.0125000002;
  alphaPolynomial = sampleColor.a * alphaPolynomial - sampleColor.a;
  alphaPolynomial = alphaPolynomial * 0.349999994 + sampleColor.a;
  float gammaAlpha = clamp(exp2(log2(abs(sampleColor.a)) * 0.416700006) * 1.05499995 - 0.0549999997, 0.0, 1.0);
  float mixedAlpha = (gammaAlpha - sampleColor.a) * 0.649999976 + sampleColor.a;
  float luminance = dot(sampleColor.rgb, vec3(0.212599993, 0.715200007, 0.0722000003));
  float currentAlpha = luminance * (alphaPolynomial - mixedAlpha) + mixedAlpha;
  vec2 edge = (vec2(1.0) - abs(vClipCoordinate)) * uClipArgs0;
  float clipAlpha = clamp(min(edge.y, edge.x), 0.0, 1.0);
  finalColor = vec4(sampleColor.rgb, currentAlpha * clipAlpha);
}`;

type SoftClipUniforms = {
  [key: string]: { value: Float32Array; type: "vec4<f32>" | "vec2<f32>" };
  uClipRange0: { value: Float32Array; type: "vec4<f32>" };
  uClipArgs0: { value: Float32Array; type: "vec2<f32>" };
};

export interface NguiSoftClipFilter extends Filter {
  readonly resources: Filter["resources"] & {
    readonly softClipUniforms: UniformGroup<SoftClipUniforms>;
  };
}

export function createNguiSoftClipFilter(
  centerX: number,
  centerY: number,
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): NguiSoftClipFilter {
  validate(centerX, centerY, clipWidth, clipHeight, softnessX, softnessY);
  const uniforms = calculateNguiSoftClipUniforms(centerX, centerY, clipWidth, clipHeight, softnessX, softnessY);
  return new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "ngui-current-gles3-soft-clip" }),
    resources: { softClipUniforms: new UniformGroup(uniforms) },
    padding: 0,
    antialias: "inherit",
  }) as NguiSoftClipFilter;
}

export function updateNguiSoftClipFilter(
  filter: NguiSoftClipFilter,
  centerX: number,
  centerY: number,
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): void {
  validate(centerX, centerY, clipWidth, clipHeight, softnessX, softnessY);
  const values = calculateNguiSoftClipUniforms(centerX, centerY, clipWidth, clipHeight, softnessX, softnessY);
  filter.resources.softClipUniforms.uniforms.uClipRange0 = values.uClipRange0.value;
  filter.resources.softClipUniforms.uniforms.uClipArgs0 = values.uClipArgs0.value;
}

export function calculateNguiSoftClipUniforms(
  centerX: number,
  centerY: number,
  clipWidth: number,
  clipHeight: number,
  softnessX: number,
  softnessY: number,
): SoftClipUniforms {
  return {
    uClipRange0: {
      value: new Float32Array([
        Math.fround(-2 * centerX / clipWidth),
        Math.fround(-2 * centerY / clipHeight),
        Math.fround(2 / clipWidth),
        Math.fround(2 / clipHeight),
      ]),
      type: "vec4<f32>",
    },
    uClipArgs0: {
      value: new Float32Array([
        Math.fround(clipWidth / (2 * softnessX)),
        Math.fround(clipHeight / (2 * softnessY)),
      ]),
      type: "vec2<f32>",
    },
  };
}

function validate(...values: readonly number[]): void {
  if (!values.every(Number.isFinite) || values[2]! <= 0 || values[3]! <= 0 || values[4]! <= 0 || values[5]! <= 0) {
    throw new Error("NGUI SoftClip requires finite center and positive clip/softness dimensions.");
  }
}

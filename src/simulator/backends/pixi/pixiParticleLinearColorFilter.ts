import { Filter, GlProgram, UniformGroup } from "pixi.js";

const VERTEX = `
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

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uParticleColor;
void main(void) {
  vec4 sampled = texture(uTexture, vTextureCoord);
  finalColor = vec4(
    sampled.rgb * uParticleColor.rgb * uParticleColor.a,
    sampled.a * uParticleColor.a
  );
}`;

export interface PixiParticleLinearColorFilter extends Filter {
  readonly resources: Filter["resources"] & {
    readonly particleColorUniforms: UniformGroup<{
      uParticleColor: { value: Float32Array; type: "vec4<f32>" };
    }>;
  };
}

export function createPixiParticleLinearColorFilter(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): PixiParticleLinearColorFilter {
  const values = [red, green, blue, alpha].map(Math.fround);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Particle Linear color shader requires four finite Float32 unit channels.");
  }
  const uniforms = new UniformGroup({
    uParticleColor: {
      value: new Float32Array(values),
      type: "vec4<f32>",
    },
  });
  return new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "particle-linear-float-color",
    }),
    resources: { particleColorUniforms: uniforms },
    antialias: "inherit",
    resolution: "inherit",
  }) as PixiParticleLinearColorFilter;
}

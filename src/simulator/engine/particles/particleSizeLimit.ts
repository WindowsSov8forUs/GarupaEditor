// Reverse BND-C34: automatic orthographic camera width and billboard half size.
const f32 = Math.fround;

export function calculateNativeParticleOrthographicWidth(orthographicSize: number, aspect: number): number {
  return f32(f32(orthographicSize + orthographicSize) * aspect);
}

export function calculateNativeParticleOrthographicHalfSize(
  size: readonly [number, number],
  transformScaleX: number,
  minimumFraction: number,
  maximumFraction: number,
  cameraWidth: number,
): readonly [number, number] {
  const scale = Math.max(transformScaleX, f32(1e-5));
  const minimum = f32(f32(minimumFraction / scale) * cameraWidth);
  const maximum = f32(f32(maximumFraction / scale) * cameraWidth);
  const minimumLimit = Number.isFinite(minimum) ? minimum : 0;
  const maximumLimit = Number.isFinite(maximum) ? maximum : -1;
  const largest = Math.max(size[0], size[1], f32(1e-6));
  let half = minimumLimit >= 0 ? f32(Math.max(largest, minimumLimit) * 0.5) : 0;
  if (maximumLimit >= 0) half = Math.min(half, f32(maximumLimit * 0.5));
  const ratio = f32(half / largest);
  return [f32(size[0] * ratio), f32(size[1] * ratio)];
}

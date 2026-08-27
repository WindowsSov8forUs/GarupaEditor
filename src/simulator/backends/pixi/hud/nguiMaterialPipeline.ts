export function f32FromLittleEndianBits(bits: string): number {
  if (!/^[0-9A-F]{8}$/.test(bits)) throw new Error("NGUI color channel requires eight uppercase hexadecimal digits.");
  const bytes = bits.match(/../g)!.map((entry) => Number.parseInt(entry, 16));
  const buffer = Uint8Array.from(bytes).buffer;
  return new DataView(buffer).getFloat32(0, true);
}

export function nguiRgbTint(colorF32Bits: readonly [string, string, string, string]): number {
  return linearTintFromSrgbChannels(
    f32FromLittleEndianBits(colorF32Bits[0]),
    f32FromLittleEndianBits(colorF32Bits[1]),
    f32FromLittleEndianBits(colorF32Bits[2]),
  );
}

/** NGUI/UILabel/UIWidget colors are serialized as sRGB channels in this Linear project. */
export function linearTintFromSrgbColor(color: number): number {
  return linearTintFromSrgbChannels(
    ((color >>> 16) & 0xff) / 255,
    ((color >>> 8) & 0xff) / 255,
    (color & 0xff) / 255,
  );
}

export function linearTintFromSrgbChannels(red: number, green: number, blue: number): number {
  const byte = (value: number) => Math.round(srgbChannelToLinear(value) * 255);
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

function srgbChannelToLinear(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("NGUI sRGB color channel must be finite in [0, 1].");
  }
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function nguiAlpha(colorF32Bits: readonly [string, string, string, string]): number {
  return f32FromLittleEndianBits(colorF32Bits[3]);
}

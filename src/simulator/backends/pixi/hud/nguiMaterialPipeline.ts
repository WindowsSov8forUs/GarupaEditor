export function f32FromLittleEndianBits(bits: string): number {
  if (!/^[0-9A-F]{8}$/.test(bits)) throw new Error("NGUI color channel requires eight uppercase hexadecimal digits.");
  const bytes = bits.match(/../g)!.map((entry) => Number.parseInt(entry, 16));
  const buffer = Uint8Array.from(bytes).buffer;
  return new DataView(buffer).getFloat32(0, true);
}

export function nguiRgbTint(colorF32Bits: readonly [string, string, string, string]): number {
  const channel = (bits: string) => Math.round(f32FromLittleEndianBits(bits) * 255);
  return (channel(colorF32Bits[0]) << 16) |
    (channel(colorF32Bits[1]) << 8) |
    channel(colorF32Bits[2]);
}

export function nguiAlpha(colorF32Bits: readonly [string, string, string, string]): number {
  return f32FromLittleEndianBits(colorF32Bits[3]);
}
